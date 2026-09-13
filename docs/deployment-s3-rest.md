# Deploy through the S3 HTTPS object endpoint

This option publishes the static production build from a dedicated S3 bucket when CloudFront creation is unavailable. It uses the normal permissions of the configured AWS identity. It does not change IAM or account-wide S3 settings.

The entry point is `https://BUCKET.s3.us-east-1.amazonaws.com/index.html`. Keep **`/index.html`** in links: the REST endpoint does not resolve a default index. It is different from S3 website hosting and supports HTTPS. No website endpoint is enabled.

## Access and operational limits

- Only validated files in `dist/` are uploaded. Source, prospect lists, local artifacts, credentials, hidden files, and symlinks must not be included.
- The public policy names the released object keys and permits only `s3:GetObject`. It does not grant public bucket listing or writes. Unlisted files remain private.
- The dedicated bucket permits a public object policy while keeping public ACLs blocked, ACLs disabled with BucketOwnerEnforced, and SSE-S3 encryption. Account-wide protections remain unchanged.
- The bucket policy denies reads of the released objects without HTTPS. Public HTTP reads fail; this host does not redirect HTTP to HTTPS.
- There is no CloudFront cache or custom domain. S3 storage, requests, and data transfer can incur AWS charges. The deployment does not enforce a spending cap.
- The production HTML includes a Content Security Policy and a no-referrer policy in meta tags. S3 cannot supply all custom security response headers; for example, CSP `frame-ancestors` requires an HTTP header and is not provided by the meta tag.

## Publish and verify

Use the retained `artifacts/aws-deployment.json` state. The deployment checks the existing bucket owner, project tags, mode, and policy before changing the bucket. Never delete state to bypass a mismatch.

```sh
PUBLIC_BASE_PATH=/ npm run build
python3 scripts/deploy-aws.py --hosting s3-rest
python3 scripts/deploy-aws.py --hosting s3-rest --apply
```

Inspect the read-only plan before applying it. The default CloudFront mode refuses a state already configured for S3 REST hosting, so an accidental default invocation cannot make the live public site private. Switching hosting modes requires a separate, deliberate migration.

Run browser checks against the exact entry-point URL:

```sh
MERCHANT_BRIDGE_TEST_URL=https://BUCKET.s3.us-east-1.amazonaws.com/index.html npm run test:e2e
```

Verify the checker, brief download, public inquiry destination, checklist, mobile layout, and accessibility. Confirm that unauthenticated access to the bucket root, private paths, and an unlisted object is denied, and HTTP access is denied. A successful upload alone does not prove the site works.

For updates, rebuild and rerun with the same state and `--hosting s3-rest`. Existing released assets remain available for cached pages; deployment performs no object deletion. Only publish assets that are intended for the public. The generated remote `site-config.json` includes the actual entry-point URL.

## Official references

- [S3 website and REST endpoint differences](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteEndpoints.html)
- [S3 Block Public Access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [S3 bucket policy examples](https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html)
- [S3 pricing](https://aws.amazon.com/s3/pricing/)

Reviewed on 13 September 2026.
