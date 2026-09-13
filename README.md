# Merchant Bridge

A focused Merchant API migration service and a local product-mapping checker for custom ecommerce connectors.

The web app includes a scope assessment, downloadable migration brief, a Content API product checker, and a readiness checklist. The checker runs locally in the browser. It does not authenticate to Google, send product data, or modify Merchant Center accounts.

## Development

```sh
npm ci
npm run dev
```

Local preview: `http://127.0.0.1:4173`.

For a temporary shareable HTTPS demonstration of the production build, see [temporary preview instructions](docs/temporary-preview.md). Availability depends on the local preview processes; permanent AWS hosting is a separate deployment.

```sh
npx playwright install chromium
npm run check
```

`npm run check` runs the core tests, static-preview boundary tests, type check, production build, and browser tests. Browser coverage includes malformed input, review exports, scope qualification, mobile layout, and automated accessibility checks. Set `MERCHANT_BRIDGE_TEST_URL` to run the browser suite against an actual deployed preview instead of the development server.

## Product mapping boundaries

The converter supports a deliberate subset of online Content API product fields. It produces `products/v1` `ProductInput` candidates using `productAttributes`, `legacyLocal`, and integer-string price micros. Invalid or duplicate product identities are blocked. Unsupported fields are identified for review.

Passing local checks does not establish Google approval or full API validity. A live migration requires complete field reconciliation, a confirmed data source, authentication, and controlled API testing in the customer's existing project. Read [the technical runbook](docs/technical-runbook.md).

## Configuration

`public/site-config.json` supports:

- `contactEmail`: an actual, verified contact address, if available.
- `bookingUrl`: an HTTPS scheduling link, if available.
- `contactIssueUrl`: the public GitHub project-inquiry form.
- `siteUrl`: the published site URL.

When no email or scheduling URL is configured, the app offers the public GitHub inquiry. It explicitly says a GitHub account is required and advises against sharing private information. The application does not pretend to submit a lead when downloading a brief.

Fonts are self-hosted. The app uses no tracking cookies or analytics SDK.

## Deployment

Build with `npm run build`. Only `dist/` belongs on the public web host. The AWS deployment utility is documented in [deployment notes](docs/deployment.md). AWS usage is billed by AWS; the script does not promise free hosting.

Local `sales/` and `artifacts/` folders are excluded from version control. They contain private prospect research, unsent drafts, screenshots, and deployment state; do not publish them.

## Service boundaries

The proposed USD 1,250 sprint covers one existing Merchant account, one custom source, one market/language flow, and up to 5,000 existing SKUs, subject to an 8–12 hour engineering scope. A two-business-day delivery target starts after scope and required access are ready. Product approval, policy appeals, account reinstatement, and advertising results are separate processes.

Merchant Bridge is an independent service, not affiliated with or endorsed by Google.
