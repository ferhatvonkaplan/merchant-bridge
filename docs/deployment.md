# Deploy Merchant Bridge to private S3 and CloudFront

For a dedicated public bucket served through S3's HTTPS object endpoint, see [S3 REST deployment](deployment-s3-rest.md). That option uses `--hosting s3-rest` and does not require CloudFront permissions. The two hosting modes cannot be silently mixed in one deployment state.

The deployment script is **prepared for operator review; preparation does not publish anything**. It requires Python 3, AWS CLI v2 and an already authenticated AWS profile/session. It does not accept, save or print AWS secret keys. There are no SDK dependencies.

## Architecture and charges

- One private S3 bucket in **us-east-1**, named `merchant-bridge-<12-digit-account-id>-<8-hex-suffix>`.
- All four S3 public-access-block settings enabled, ACLs disabled with BucketOwnerEnforced, and SSE-S3/AES256 encryption. No public website endpoint is enabled.
- CloudFront uses an Origin Access Control (OAC) with `sigv4` and `SigningBehavior=always`, so signed origin requests use HTTPS. The bucket allows reads only for the specific CloudFront distribution ARN, and denies insecure transport.
- CloudFront redirects HTTP viewers to HTTPS, uses its provided certificate/domain, serves `index.html` by default, and uses `PriceClass_100`, compression, the managed CachingOptimized cache policy and managed SecurityHeadersPolicy. There are no custom domains, DNS changes, email services, API backends or signup flows.
- S3 and the CloudFront distribution are tagged `Project=MerchantBridge`. CloudFront OAC does not expose the same resource-tagging operation; its project-specific name identifies it.
- No access logging, WAF, Origin Shield, paid functions, invalidations or storage versioning are enabled by this script. No paid pricing-plan subscription is selected.

**AWS usage charges apply. This is not a promise of free hosting.** S3 storage and requests, CloudFront viewer requests/data transfer and any applicable regional taxes/rates depend on actual usage and account terms. PriceClass_100 limits the edge-location price class, not total traffic or spend. The script does not create a billing alarm or enforce a spending cap. Review [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) and [S3 pricing](https://aws.amazon.com/s3/pricing/) for the account before publishing.

## Review and publish

1. Keep `artifacts/aws-deployment.json` and `artifacts/aws-deployment.json.lock` out of the public GitHub release. State contains resource IDs and deployment inventory, not credentials. The script writes state atomically with owner-only file permissions. Keep it available to resume or clean up the same deployment.
2. Inspect `dist` and the contact destination before release. The script uploads **only files below dist**; it rejects hidden files, symlinks, source maps, TypeScript and other unexpected file extensions. Do not place customer exports, private reports or credentials in dist. The synthetic example JSON and public checklist are intentional public assets.
3. Build for the CloudFront domain root. A GitHub Pages build with `/merchant-bridge/` asset paths will fail here and is rejected:

   ```sh
   PUBLIC_BASE_PATH=/ npm run build
   ```

4. Review the read-only plan. This invokes STS to identify the current account but performs no AWS writes and saves no new state:

   ```sh
   python3 scripts/deploy-aws.py
   ```

5. After reviewing the account, files, configuration and expected AWS charges, explicitly publish:

   ```sh
   python3 scripts/deploy-aws.py --apply
   ```

   Progress is printed to stderr. The final stdout JSON contains `siteUrl`, bucket name, distribution ID, deployment status and state path. Distribution propagation may still be in progress when the script returns. It does not block on an unbounded deployment waiter.

6. The script uploads a temporary generated copy of `dist/site-config.json` with `siteUrl` set to `https://<distribution-domain>/`. Other configuration fields, including the inquiry destination, are preserved. **Neither public/site-config.json nor dist/site-config.json is modified locally.** Update the source config separately if desired for future releases; the deploy override still supplies the actual CloudFront URL.
7. Verify the public HTTPS page, example loading, downloads, inquiry destination and mobile layout. Confirm direct S3 access is denied. Check HTTP redirects to HTTPS and inspect the CloudFront security headers. Test only public synthetic data. AWS account authentication does not establish that the public page has finished propagating.

Optional CloudFront status checks, replacing the placeholder with the ID from state:

```sh
aws cloudfront get-distribution --id DISTRIBUTION_ID --query 'Distribution.Status' --output text
```

Do not publish a broken site or claim deployment succeeded solely because resources were created.

## Resume, updates and cache behavior

The intended bucket name and CloudFront CallerReference are saved before resource creation. Successful resource steps are immediately checkpointed. On failure **nothing is automatically deleted**. Rerun the same command with the same state file and authenticated account. The script recovers existing resources by their project-specific name/caller reference if a response was lost after creation.

Account-wide CloudFront LIST permissions are optional for a first create when the relevant CREATE permission is independently granted. If `ListOriginAccessControls` or `ListDistributions` returns `AccessDenied`, the script attempts the corresponding normal CREATE operation using the already saved OAC name or distribution CallerReference. A CREATE denial stops deployment. A saved resource ID always requires the normal GET verification; GET denial also stops deployment. The script never changes IAM permissions, grants access, changes identities, or treats another denied operation as permission to continue.

There is a recovery limit without LIST permission: if AWS created a resource but its response was lost before its ID could be saved, retrying the same OAC name or distribution CallerReference can return an already-exists error. The script stops and retains state; it does **not** generate a new name/reference or duplicate the resource. An authorized account owner must retrieve the existing resource ID and reconcile it with this deployment state before rerunning. With LIST permission available, the existing name/caller-reference recovery path can locate it automatically. Do not delete state or replace the saved name/reference to work around this situation.

The script rechecks bucket ownership and private settings and verifies existing OAC/distribution configuration. It will stop on CloudFront configuration drift rather than silently overwrite it. Infrastructure edits need manual review and a fresh ETag if using `update-distribution`; there is no automatic distribution-update path. Do not delete the state file to work around drift, because doing so can create a second billable deployment.

Each successful upload records a content hash, MIME type and cache policy in state. Unchanged files are skipped on resume. Use `--force-upload` if someone edited or removed remote objects outside this script. Changed builds are uploaded by rerunning with `--apply` after rebuilding. Static assets are uploaded before HTML; old objects are kept to support visitors with older cached pages. The script does not synchronize deletions.

- Fingerprinted `assets/name-<hash>.js/css` and other fingerprinted assets: `public,max-age=31536000,immutable`.
- `index.html`, `site-config.json` and other non-fingerprinted public files: `public,max-age=60`.
- No invalidations are created, including on the first deploy. Expect cache/edge propagation before changes appear. Do not reuse an immutable asset filename for changed bytes.

The default state path is `artifacts/aws-deployment.json`. `--state PATH` and `--dist PATH` allow an explicitly chosen release/state location. A local file lock prevents two invocations from sharing the same state concurrently. The script uses the current AWS auth chain; `AWS_PROFILE` may select a previously configured profile. Never put credentials in the command line or deployment state.

Required permissions include STS caller identity, S3 bucket creation/configuration/policy/tagging and object upload, and CloudFront OAC/distribution creation, reads and tagging. CloudFront listing improves recovery but is not required when a new resource can be created and its returned ID saved normally. Use an appropriately scoped deployment identity. The script does not create IAM users, keys or new permission grants for the operator.

## Manual cleanup only — destructive, never automatic

These steps are for an operator intentionally retiring the public site. **They were not executed while preparing this project.** Disabling CloudFront removes availability; emptying S3 deletes the hosted release. Confirm the exact IDs, account and `Project=MerchantBridge` tags against the retained state before proceeding. Do not use these commands on an unrelated distribution or bucket.

1. Read the current distribution configuration and ETag into a local review file:

   ```sh
   aws cloudfront get-distribution-config --id DISTRIBUTION_ID --output json > distribution-to-retire.json
   ```

   Create `disabled-distribution-config.json` containing only the returned `DistributionConfig` object, with `Enabled` changed to `false`. Review it. Use the current returned ETag:

   ```sh
   aws cloudfront update-distribution --id DISTRIBUTION_ID --if-match CURRENT_ETAG --distribution-config file://disabled-distribution-config.json
   ```

2. Wait until the disabled distribution is deployed. Fetch the latest configuration/ETag again, then remove that disabled distribution:

   ```sh
   aws cloudfront get-distribution --id DISTRIBUTION_ID --query 'Distribution.Status' --output text
   aws cloudfront get-distribution-config --id DISTRIBUTION_ID --output json
   aws cloudfront delete-distribution --id DISTRIBUTION_ID --if-match LATEST_DISABLED_ETAG
   ```

3. Once no distribution uses the OAC, retrieve its current ETag and delete it:

   ```sh
   aws cloudfront get-origin-access-control --id OAC_ID --output json
   aws cloudfront delete-origin-access-control --id OAC_ID --if-match CURRENT_OAC_ETAG
   ```

4. Review the exact bucket contents first. Then, only when intentionally deleting the static release, empty and delete this project's bucket:

   ```sh
   aws s3 ls s3://EXACT_PROJECT_BUCKET --recursive --region us-east-1
   aws s3 rm s3://EXACT_PROJECT_BUCKET --recursive --region us-east-1
   aws s3api delete-bucket --bucket EXACT_PROJECT_BUCKET --expected-bucket-owner ACCOUNT_ID --region us-east-1
   ```

   The script does not enable versioning. If someone enabled it later, object versions/delete markers must also be reviewed and removed before bucket deletion; these commands alone will not empty a versioned bucket.

5. Verify the resources are gone and retain or archive the state as a record. Do not rerun `--apply` against a retired deployment without deciding explicitly whether to recreate it. Billing usage already incurred is still payable after cleanup.

## Official configuration references

- [Restrict access to an S3 origin with OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html): signed requests, HTTPS origin access, source-ARN-restricted bucket policy.
- [Managed response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html): SecurityHeadersPolicy ID `67f7725c-6f97-4210-82d7-5512b31e9d03`.
- [Managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html): CachingOptimized ID `658327ea-f89d-4fab-a63d-7e88639e58f6`, minimum TTL 1 second and maximum one year.
- [AWS CLI create-distribution-with-tags](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/create-distribution-with-tags.html): distribution configuration and project tags.

References checked on 12 September 2026. Local validation of this script does not prove AWS permissions, current account limits or live deployment success.
