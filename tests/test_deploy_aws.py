"""Offline tests only: every AWS operation is replaced with a local fake."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("merchant_bridge_deploy", ROOT / "scripts/deploy-aws.py")
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)
ACCOUNT = "123456789012"


class FakeAWS:
    def __init__(self):
        self.calls = []
        self.objects = {}
        self.policy = None
        self.bpa = {"BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True}
        self.account_bpa = None
        self.tags = [{"Key": "Project", "Value": "MerchantBridge"}, {"Key": "ManagedBy", "Value": "merchant-bridge-deploy"}]
        self.ownership = "BucketOwnerEnforced"
        self.fail = None

    def __call__(self, service, operation, **parameters):
        self.calls.append((service, operation, copy.deepcopy(parameters)))
        if operation == "get-caller-identity":
            return {"Account": ACCOUNT}
        if operation == "head-bucket":
            assert parameters["expected_bucket_owner"] == ACCOUNT
            return {}
        if operation == "get-bucket-location":
            return {"LocationConstraint": None}
        if operation == "get-bucket-tagging":
            return {"TagSet": self.tags}
        if operation == "get-bucket-ownership-controls":
            return {"OwnershipControls": {"Rules": [{"ObjectOwnership": self.ownership}]}}
        if operation == "get-public-access-block":
            if service == "s3control":
                if self.account_bpa is None:
                    raise DEPLOY.AwsError(operation, "An error occurred (NoSuchPublicAccessBlockConfiguration)")
                return {"PublicAccessBlockConfiguration": self.account_bpa}
            return {"PublicAccessBlockConfiguration": self.bpa}
        if operation == "get-bucket-policy":
            if self.policy is None:
                raise DEPLOY.AwsError(operation, "An error occurred (NoSuchBucketPolicy)")
            return {"Policy": json.dumps(self.policy)}
        if operation == "list-objects-v2":
            return {"Contents": [{"Key": key} for key in self.objects]}
        if operation == "put-bucket-encryption":
            assert parameters["server_side_encryption_configuration"]["Rules"][0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] == "AES256"
            return {}
        if operation == "put-public-access-block":
            assert service == "s3api", "No account-wide BPA changes permitted"
            self.bpa = parameters["public_access_block_configuration"]
            return {}
        if operation == "put-bucket-policy":
            self.policy = copy.deepcopy(parameters["policy"])
            if self.fail == "lost-policy-response":
                self.fail = None
                raise DEPLOY.AwsError(operation, "An error occurred (RequestTimeout)")
            return {}
        if operation == "put-object":
            self.objects[parameters["key"]] = {**parameters, "body": Path(parameters["body"]).read_bytes()}
            return {}
        raise AssertionError(f"Unexpected AWS operation: {service} {operation}")


class S3RestDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.dist = self.root / "dist"
        (self.dist / "assets").mkdir(parents=True)
        (self.dist / "index.html").write_text('<link href="/assets/index-abc12345.css"><script src="/assets/index-abc12345.js"></script>')
        (self.dist / "assets/index-abc12345.js").write_text('console.log("synthetic")')
        (self.dist / "assets/index-abc12345.css").write_text('body { color: black; }')
        (self.dist / "site-config.json").write_text('{"brand":"Merchant Bridge","siteUrl":"unchanged-local"}')
        self.state_path = self.root / "state.json"
        self.state = DEPLOY.new_state(ACCOUNT)
        self.write_state()
        self.fake = FakeAWS()
        self.mock = patch.object(DEPLOY, "aws", self.fake)
        self.mock.start()

    def tearDown(self):
        self.mock.stop()
        self.temporary.cleanup()

    def write_state(self):
        self.state_path.write_text(json.dumps(self.state))

    def invoke(self, apply=False, hosting="s3-rest"):
        arguments = ["deploy-aws.py", "--dist", str(self.dist), "--state", str(self.state_path), "--hosting", hosting]
        if apply:
            arguments.append("--apply")
        output = io.StringIO()
        with patch.object(sys, "argv", arguments), contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
            DEPLOY.main()
        return json.loads(output.getvalue())

    def mutations(self):
        return [(service, operation, args) for service, operation, args in self.fake.calls if operation.startswith(("put-", "create-", "delete-", "update-"))]

    def test_plan_checks_existing_bucket_without_changing_state_or_aws(self):
        before = self.state_path.read_bytes()
        plan = self.invoke()
        self.assertEqual(plan["siteUrl"], f"https://{self.state['bucket']}.s3.us-east-1.amazonaws.com/index.html")
        self.assertEqual(plan["hosting"], "s3-rest")
        self.assertEqual(self.state_path.read_bytes(), before)
        self.assertEqual(self.mutations(), [])

    def test_apply_scopes_public_policy_and_publishes_html_after_dependencies(self):
        result = self.invoke(apply=True)
        calls = self.fake.calls
        puts = [(index, args) for index, (_, operation, args) in enumerate(calls) if operation == "put-object"]
        policy_position = next(index for index, (_, operation, _) in enumerate(calls) if operation == "put-bucket-policy")
        self.assertEqual(puts[-1][1]["key"], "index.html")
        self.assertLess(puts[-2][0], policy_position)
        self.assertLess(policy_position, puts[-1][0])
        self.assertEqual(self.fake.bpa, {"BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": False, "RestrictPublicBuckets": False})
        expected = {f"arn:aws:s3:::{self.state['bucket']}/{key}" for key in result["publicKeys"]}
        for statement in self.fake.policy["Statement"]:
            self.assertEqual(statement["Action"], "s3:GetObject")
            self.assertEqual(set(statement["Resource"]), expected)
            self.assertTrue(all("*" not in arn and "?" not in arn for arn in statement["Resource"]))
        allow, deny = self.fake.policy["Statement"]
        self.assertEqual(allow["Condition"]["Bool"]["aws:SecureTransport"], "true")
        self.assertEqual(deny["Condition"]["Bool"]["aws:SecureTransport"], "false")
        self.assertFalse(any(service in {"iam", "cloudfront"} for service, _, _ in calls))
        self.assertFalse(any(service == "s3control" for service, _, _ in self.mutations()))
        for key, uploaded in self.fake.objects.items():
            self.assertEqual(uploaded["server_side_encryption"], "AES256")
            self.assertEqual(uploaded["expected_bucket_owner"], ACCOUNT)
            if key.startswith("assets/"):
                self.assertIn("immutable", uploaded["cache_control"])
        self.assertEqual(self.fake.objects["index.html"]["content_type"], "text/html")
        self.assertEqual(self.fake.objects["assets/index-abc12345.js"]["content_type"], "application/javascript")
        uploaded_config = json.loads(self.fake.objects["site-config.json"]["body"])
        self.assertEqual(uploaded_config["siteUrl"], result["siteUrl"])
        self.assertEqual(json.loads((self.dist / "site-config.json").read_text())["siteUrl"], "unchanged-local")

    def test_repeated_apply_skips_unchanged_uploads_and_preserves_old_releases(self):
        self.invoke(apply=True)
        before = sum(operation == "put-object" for _, operation, _ in self.fake.calls)
        self.invoke(apply=True)
        self.assertEqual(sum(operation == "put-object" for _, operation, _ in self.fake.calls), before)
        (self.dist / "assets/index-abc12345.js").rename(self.dist / "assets/index-new12345.js")
        (self.dist / "index.html").write_text('<script src="/assets/index-new12345.js"></script>')
        result = self.invoke(apply=True)
        self.assertIn("assets/index-abc12345.js", result["publicKeys"])
        self.assertIn("assets/index-new12345.js", result["publicKeys"])
        self.assertFalse(any(operation.startswith("delete-") for _, operation, _ in self.fake.calls))

    def test_lost_policy_response_resumes_exact_pending_policy(self):
        self.fake.fail = "lost-policy-response"
        with self.assertRaises(DEPLOY.AwsError):
            self.invoke(apply=True)
        state = json.loads(self.state_path.read_text())
        self.assertEqual(state["hosting_mode"], "s3-rest")
        self.assertEqual(state["s3_rest_pending_policy"], self.fake.policy)
        self.assertNotIn("index.html", self.fake.objects)
        result = self.invoke(apply=True)
        self.assertEqual(result["hosting"], "s3-rest")
        self.assertNotIn("s3_rest_pending_policy", json.loads(self.state_path.read_text()))

    def test_cloudfront_mode_cannot_make_s3_rest_bucket_private(self):
        self.state["hosting_mode"] = "s3-rest"
        self.write_state()
        with self.assertRaisesRegex(RuntimeError, "blocked before any mutation"):
            self.invoke(apply=True, hosting="cloudfront")
        self.assertEqual(self.mutations(), [])

    def test_conflicting_cloudfront_reference_or_step_is_rejected(self):
        for patch_state in [{"distribution_id": "EOTHER"}, {"oac_id": "OACOTHER"}, {"steps": {"distribution_created": "earlier"}}]:
            self.state.update(patch_state)
            self.write_state()
            with self.assertRaisesRegex(RuntimeError, "references CloudFront"):
                self.invoke(apply=True)
            self.assertEqual(self.mutations(), [])

    def test_account_protection_is_not_changed_or_bypassed(self):
        self.fake.account_bpa = {"BlockPublicPolicy": True}
        with self.assertRaisesRegex(RuntimeError, "Account-level"):
            self.invoke(apply=True)
        self.assertEqual(self.mutations(), [])

    def test_unexpected_policy_is_never_overwritten(self):
        self.fake.policy = {"Version": "2012-10-17", "Statement": [{"Sid": "AnotherApplication"}]}
        with self.assertRaisesRegex(RuntimeError, "Unexpected existing bucket policy"):
            self.invoke(apply=True)
        self.assertEqual(self.mutations(), [])

    def test_unrelated_objects_are_rejected(self):
        self.fake.objects["private/customer-export.json"] = {"body": b"not public"}
        with self.assertRaisesRegex(RuntimeError, "unrelated objects"):
            self.invoke(apply=True)
        self.assertEqual(self.mutations(), [])

    def test_owner_tags_and_acl_protections_must_match_before_any_write(self):
        for field, bad in [("tags", [{"Key": "Project", "Value": "Different"}]), ("ownership", "ObjectWriter"), ("bpa", {"BlockPublicAcls": False, "IgnorePublicAcls": True})]:
            old = getattr(self.fake, field)
            setattr(self.fake, field, bad)
            with self.assertRaises(RuntimeError):
                self.invoke(apply=True)
            setattr(self.fake, field, old)
        self.assertEqual(self.mutations(), [])

    def test_public_policy_rejects_wildcards_policy_variables_and_oversized_manifest(self):
        for key in ["assets/*.js", "assets/a?.js", "${aws:username}.json", "../private.json", ".env.json"]:
            with self.assertRaises(RuntimeError):
                DEPLOY.s3_rest_policy(self.state, [key])
        with self.assertRaisesRegex(RuntimeError, "20 KB"):
            DEPLOY.s3_rest_policy(self.state, [f"assets/very-long-filename-{i:06}.js" for i in range(500)])

    def test_s3_rest_requires_existing_state_and_does_not_create_a_bucket(self):
        self.state_path.unlink()
        with self.assertRaisesRegex(RuntimeError, "existing dedicated"):
            self.invoke(apply=True)
        self.assertEqual(self.mutations(), [])


if __name__ == "__main__":
    unittest.main()
