#!/usr/bin/env python3
"""Private S3 + CloudFront deployment. Read-only plan unless --apply is supplied.

Python standard library + AWS CLI v2 only. No credentials are accepted or printed.
Resource state is saved after each successful step; no cleanup runs on failure.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
REGION = "us-east-1"
PROJECT = "MerchantBridge"
CACHE_POLICY = "658327ea-f89d-4fab-a63d-7e88639e58f6"
HEADERS_POLICY = "67f7725c-6f97-4210-82d7-5512b31e9d03"
SAFE_EXTENSIONS = {".html", ".js", ".css", ".json", ".svg", ".png", ".webp", ".ico", ".jpg", ".jpeg", ".gif", ".woff", ".woff2", ".ttf", ".otf", ".txt", ".md"}


class AwsError(RuntimeError):
    def __init__(self, operation: str, stderr: str):
        self.code = (re.search(r"\(([^)]+)\)", stderr) or [None, "Unknown"])[1]
        super().__init__(f"AWS {operation} failed ({self.code}). {stderr.strip()[:1200]}")


def aws(service: str, operation: str, **parameters):
    command = ["aws", service, operation, "--region", REGION, "--output", "json", "--no-cli-pager"]
    for name, value in parameters.items():
        command.append("--" + name.replace("_", "-"))
        if isinstance(value, (dict, list)):
            command.append(json.dumps(value, separators=(",", ":")))
        else:
            command.append(str(value))
    env = dict(os.environ, AWS_PAGER="", AWS_CLI_AUTO_PROMPT="off")
    # Never use a shell or log the environment. AWS CLI uses its existing auth chain.
    result = subprocess.run(command, capture_output=True, text=True, env=env, timeout=180)
    if result.returncode:
        raise AwsError(f"{service} {operation}", result.stderr)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def now():
    return datetime.now(timezone.utc).isoformat()


def save(path: Path, state: dict):
    state["updated_at"] = now()
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(state, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def deployment_lock(state_path: Path):
    state_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(str(state_path) + ".lock", os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Another deployment is using this state file.") from error
        yield


def inspect_dist(dist: Path):
    if not dist.is_dir() or not (dist / "index.html").is_file():
        raise RuntimeError("Build dist first with PUBLIC_BASE_PATH=/ npm run build.")
    files = []
    for path in sorted(dist.rglob("*")):
        if path.is_symlink():
            raise RuntimeError(f"Refusing a symlink in dist: {path.relative_to(dist)}")
        if not path.is_file():
            continue
        relative = path.relative_to(dist)
        if any(part.startswith(".") for part in relative.parts) or path.suffix.lower() not in SAFE_EXTENSIONS:
            raise RuntimeError(f"Unexpected build file: {relative}. Only public static assets may be deployed.")
        files.append((relative.as_posix(), path))
    html = (dist / "index.html").read_text()
    assets = re.findall(r'''(?:src|href)=["']([^"']+\.(?:js|css))["']''', html)
    if not assets or any(not value.startswith(("/assets/", "./assets/")) for value in assets):
        raise RuntimeError("Build asset URLs must use /assets/ or ./assets/. Rebuild with PUBLIC_BASE_PATH=/; a GitHub Pages subpath build will not work here.")
    config = json.loads((dist / "site-config.json").read_text())
    if not isinstance(config, dict):
        raise RuntimeError("dist/site-config.json must contain an object.")
    return files, config


def new_state(account: str):
    return {
        "version": 1, "project": PROJECT, "account_id": account, "region": REGION,
        "bucket": f"merchant-bridge-{account}-{secrets.token_hex(4)}",
        "caller_reference": "merchant-bridge-" + str(uuid.uuid4()),
        "steps": {}, "uploads": {}, "created_at": now(),
    }


def load_state(path: Path, account: str):
    state = json.loads(path.read_text()) if path.exists() else new_state(account)
    if state.get("version") != 1 or state.get("project") != PROJECT or state.get("account_id") != account or state.get("region") != REGION:
        raise RuntimeError("Deployment state does not match this AWS account, project, region or schema. Do not reuse it for another account.")
    if not re.fullmatch(rf"merchant-bridge-{re.escape(account)}-[a-f0-9]{{8}}", state.get("bucket", "")):
        raise RuntimeError("Unexpected bucket name in deployment state.")
    return state


def bucket_setup(state, checkpoint):
    bucket, account = state["bucket"], state["account_id"]
    try:
        aws("s3api", "head-bucket", bucket=bucket, expected_bucket_owner=account)
    except AwsError as error:
        if error.code not in {"404", "NoSuchBucket", "NotFound"}:
            raise
        aws("s3api", "create-bucket", bucket=bucket, object_ownership="BucketOwnerEnforced")
        checkpoint("bucket_created")
    checkpoint("bucket_verified")
    settings = [
        ("put-public-access-block", {"public_access_block_configuration": {"BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True}}),
        ("put-bucket-ownership-controls", {"ownership_controls": {"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]}}),
        ("put-bucket-encryption", {"server_side_encryption_configuration": {"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}}),
        ("put-bucket-tagging", {"tagging": {"TagSet": [{"Key": "Project", "Value": PROJECT}, {"Key": "ManagedBy", "Value": "merchant-bridge-deploy"}]}}),
    ]
    for operation, parameters in settings:
        aws("s3api", operation, bucket=bucket, expected_bucket_owner=account, **parameters)
        checkpoint(operation)


def oac_setup(state, checkpoint):
    name = state["bucket"] + "-oac"
    desired = {"Name": name, "Description": "MerchantBridge private S3 origin", "SigningProtocol": "sigv4", "SigningBehavior": "always", "OriginAccessControlOriginType": "s3"}
    if not state.get("oac_id"):
        try:
            listing = aws("cloudfront", "list-origin-access-controls")
        except AwsError as error:
            if error.code not in {"AccessDenied", "AccessDeniedException"}:
                raise
            # Account-wide LIST may be denied while CREATE is separately granted.
            # Try that normal API permission; never change names to evade a
            # duplicate error or attempt to modify the caller's IAM permissions.
            print("CloudFront OAC listing is not permitted; attempting normal CREATE with the saved project-specific name.", file=sys.stderr)
            listing = {}
        candidates = listing.get("OriginAccessControlList", {}).get("Items", [])
        existing = next((entry for entry in candidates if entry["Name"] == name), None)
        if existing:
            state["oac_id"] = existing["Id"]
        else:
            created = aws("cloudfront", "create-origin-access-control", origin_access_control_config=desired)
            state["oac_id"] = created["OriginAccessControl"]["Id"]
        checkpoint("oac_identified")
    actual = aws("cloudfront", "get-origin-access-control", id=state["oac_id"])["OriginAccessControl"]["OriginAccessControlConfig"]
    if any(actual.get(key) != value for key, value in desired.items()):
        raise RuntimeError("Existing OAC differs from the expected signing configuration; review it manually.")
    checkpoint("oac_verified")


def distribution_config(state):
    return {
        "CallerReference": state["caller_reference"],
        "Comment": f"MerchantBridge static site: {state['bucket']}",
        "Enabled": True, "DefaultRootObject": "index.html", "PriceClass": "PriceClass_100",
        "HttpVersion": "http2", "IsIPV6Enabled": True,
        "Origins": {"Quantity": 1, "Items": [{
            "Id": "merchant-bridge-s3", "DomainName": f"{state['bucket']}.s3.{REGION}.amazonaws.com",
            "S3OriginConfig": {"OriginAccessIdentity": ""}, "OriginAccessControlId": state["oac_id"],
        }]},
        "DefaultCacheBehavior": {
            "TargetOriginId": "merchant-bridge-s3", "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}},
            "Compress": True, "CachePolicyId": CACHE_POLICY, "ResponseHeadersPolicyId": HEADERS_POLICY,
        },
        "ViewerCertificate": {"CloudFrontDefaultCertificate": True},
        "Restrictions": {"GeoRestriction": {"RestrictionType": "none", "Quantity": 0}},
    }


def contains(actual, expected):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(key in actual and contains(actual[key], value) for key, value in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(actual) == len(expected) and all(contains(a, b) for a, b in zip(actual, expected))
    return actual == expected


def distribution_setup(state, checkpoint):
    desired = distribution_config(state)
    if not state.get("distribution_id"):
        # Recover the response-lost window after a successful create. CallerReference
        # was persisted before any mutation and prevents duplicate creation.
        try:
            listing = aws("cloudfront", "list-distributions")
        except AwsError as error:
            if error.code not in {"AccessDenied", "AccessDeniedException"}:
                raise
            # The saved CallerReference protects against duplicate distributions.
            # If a previous create response was lost and LIST is unavailable,
            # CREATE can report AlreadyExists; retain state and stop for recovery.
            print("CloudFront distribution listing is not permitted; attempting normal CREATE with the saved CallerReference.", file=sys.stderr)
            listing = {}
        for entry in listing.get("DistributionList", {}).get("Items", []):
            if entry.get("Comment") != desired["Comment"]:
                continue
            found = aws("cloudfront", "get-distribution", id=entry["Id"])["Distribution"]
            if found["DistributionConfig"]["CallerReference"] == state["caller_reference"]:
                state["distribution_id"] = found["Id"]
                checkpoint("distribution_recovered")
                break
        if not state.get("distribution_id"):
            created = aws("cloudfront", "create-distribution-with-tags", distribution_config_with_tags={
                "DistributionConfig": desired,
                "Tags": {"Items": [{"Key": "Project", "Value": PROJECT}, {"Key": "ManagedBy", "Value": "merchant-bridge-deploy"}]},
            })["Distribution"]
            state.update(distribution_id=created["Id"], distribution_arn=created["ARN"], domain=created["DomainName"])
            checkpoint("distribution_created")
    response = aws("cloudfront", "get-distribution", id=state["distribution_id"])
    actual = response["Distribution"]
    if not contains(actual["DistributionConfig"], desired):
        raise RuntimeError("Existing CloudFront configuration differs from this script. No automatic overwrite performed; review drift using its latest ETag.")
    state.update(distribution_arn=actual["ARN"], domain=actual["DomainName"], distribution_etag=response["ETag"], distribution_status=actual["Status"], site_url=f"https://{actual['DomainName']}/")
    checkpoint("distribution_verified")


def policy_setup(state, checkpoint):
    bucket_arn = f"arn:aws:s3:::{state['bucket']}"
    policy = {"Version": "2012-10-17", "Statement": [
        {"Sid": "AllowOnlyThisCloudFrontDistribution", "Effect": "Allow", "Principal": {"Service": "cloudfront.amazonaws.com"}, "Action": "s3:GetObject", "Resource": bucket_arn + "/*", "Condition": {"StringEquals": {"AWS:SourceArn": state["distribution_arn"]}}},
        {"Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*", "Action": "s3:*", "Resource": [bucket_arn, bucket_arn + "/*"], "Condition": {"Bool": {"aws:SecureTransport": "false"}}},
    ]}
    aws("s3api", "put-bucket-policy", bucket=state["bucket"], expected_bucket_owner=state["account_id"], policy=policy)
    checkpoint("bucket_policy")


def uploads(state, checkpoint, files, config, force):
    # Upload assets first and HTML last so existing clients do not receive HTML
    # that refers to assets which have not been uploaded yet. Never delete old assets.
    ordered = sorted(files, key=lambda entry: (entry[0] == "index.html", entry[0]))
    with tempfile.TemporaryDirectory(prefix="merchant-bridge-upload-") as temporary:
        generated = Path(temporary) / "site-config.json"
        generated.write_text(json.dumps({**config, "siteUrl": state["site_url"]}, indent=2) + "\n")
        for key, source in ordered:
            if key == "site-config.json":
                source = generated
            immutable = bool(re.fullmatch(r"assets/[^/]+-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+", key))
            cache = "public,max-age=31536000,immutable" if immutable else "public,max-age=60"
            mime = {".js": "application/javascript", ".json": "application/json", ".md": "text/markdown"}.get(source.suffix) or mimetypes.guess_type(source.name)[0] or "application/octet-stream"
            fingerprint = {"sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "cache_control": cache, "content_type": mime}
            if not force and state["uploads"].get(key) == fingerprint:
                continue
            aws("s3api", "put-object", bucket=state["bucket"], expected_bucket_owner=state["account_id"], key=key, body=str(source), content_type=mime, cache_control=cache, server_side_encryption="AES256")
            state["uploads"][key] = fingerprint
            checkpoint("upload:" + key)
    checkpoint("uploads_complete")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create/update AWS resources and upload dist; absent means read-only plan.")
    parser.add_argument("--dist", type=Path, default=ROOT / "dist")
    parser.add_argument("--state", type=Path, default=ROOT / "artifacts/aws-deployment.json")
    parser.add_argument("--force-upload", action="store_true", help="Reupload unchanged files if remote objects were removed or edited.")
    args = parser.parse_args()
    files, config = inspect_dist(args.dist.resolve())
    account = aws("sts", "get-caller-identity")["Account"]
    if not re.fullmatch(r"\d{12}", account):
        raise RuntimeError("AWS account ID is not a standard commercial-region account ID.")
    state_path = args.state.resolve()
    if not args.apply:
        state = load_state(state_path, account)
        print(json.dumps({"mode": "plan", "account_id": account, "region": REGION, "bucket": state["bucket"] if state_path.exists() else "generated-and-persisted-on-apply", "existing_distribution": state.get("distribution_id"), "files": [key for key, _ in files], "state": str(state_path), "cost": "AWS usage charges apply; no free-service guarantee.", "next": "Review, then rerun with --apply."}, indent=2))
        return
    with deployment_lock(state_path):
        state = load_state(state_path, account)
        # Persist intended resource names before create calls, for crash recovery.
        save(state_path, state)

        def checkpoint(step):
            state["steps"][step] = now()
            save(state_path, state)
            print(f"Completed: {step}", file=sys.stderr)

        try:
            bucket_setup(state, checkpoint)
            oac_setup(state, checkpoint)
            distribution_setup(state, checkpoint)
            policy_setup(state, checkpoint)
            uploads(state, checkpoint, files, config, args.force_upload)
        except Exception:
            # Keep the most recent successful state and all created resources.
            print(f"Deployment stopped. Resources were retained; rerun with the same state: {state_path}", file=sys.stderr)
            raise
        print(json.dumps({"siteUrl": state["site_url"], "bucket": state["bucket"], "distributionId": state["distribution_id"], "distributionStatus": state["distribution_status"], "state": str(state_path), "note": "CloudFront provisioning may still be in progress. No invalidation was created."}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"error": str(error), "cleanupPerformed": False}), file=sys.stderr)
        sys.exit(1)
