# Merchant Bridge: limited migration preflight and delivery runbook

Verified against official Google documentation on **12 September 2026**. The cited schema and migration documents were published or last updated on or before **11 September 2026**, the research cutoff. Recheck Google documentation when delivering a customer project.

## What this MVP actually does

Merchant Bridge inspects an existing Content API v2.1 product JSON export locally and proposes a **limited Merchant API products/v1 ProductInput body**. The library makes no network requests, accepts no credentials, and does not change Merchant Center, Google Cloud or AWS. Demo items and example.com URLs are synthetic. Never upload these demo products to a real account.

`analyzeProducts(input: unknown): MigrationReport` accepts a product object, a product array, or `{ "resources": [...] }`. It produces one result per product with source index, offer ID, issues and a proposed payload. Malformed roots or an empty input produce a blocked diagnostic row; the summary counts that row. Wrapper metadata is reported on product rows; a `nextPageToken` warns that the export may be incomplete. The report does not include missing pages.

- **ready:** this converter's supported local checks passed. This does **not** mean the full integration is migrated, the payload has passed all Google validation, or the product will be approved or served in ads.
- **review:** a proposed payload is available, but information was omitted, inferred, normalized or may have lost precision. Resolve every warning before any production insertion. In particular, inserting a partial body can replace existing product data.
- **blocked:** an input error or duplicate identity was found. Payload is `null`; do not generate a production write from this row.

The tool does not validate category-specific requirements, identity ownership, GTIN check digits, landing-page content, image availability, currency support by destination, permissions, data-source settings, product approval, tax, shipping, local inventory, policies, availability dates, quotas or account suspension. A locally accepted zero price still needs validation against the actual product/program requirements.

## Verified REST shape

The current v1 body uses **`productAttributes`**, not `attributes`. It has no `channel` field. For supported Content API `channel: "online"` products the converter emits `legacyLocal: false`. Content `channel: "local"` products are blocked: legacy-local identity and inventory are outside this MVP.

```json
{
  "legacyLocal": false,
  "offerId": "EXISTING-CUSTOMER-SKU",
  "contentLanguage": "en",
  "feedLabel": "US",
  "productAttributes": {
    "title": "Existing customer product title",
    "description": "Existing customer description",
    "link": "https://example.com/existing-product",
    "imageLink": "https://example.com/existing-image.jpg",
    "availability": "IN_STOCK",
    "condition": "NEW",
    "price": { "amountMicros": "24950000", "currencyCode": "USD" }
  }
}
```

This is only a request **body**, not a complete API request. A future, separately authorized implementation must identify the account and API data source outside the body:

```text
POST https://merchantapi.googleapis.com/products/v1/accounts/{ACCOUNT_ID}/productInputs:insert
query dataSource=accounts/{ACCOUNT_ID}/dataSources/{DATA_SOURCE_ID}
```

The insert endpoint supports API data sources. Google documents replacement of an existing input with the same identity, and moving an existing product when a different data source is supplied. Treat account/data-source selection and every insertion as material changes. An accepted insert can take several minutes to appear as a processed product.

### Supported mapping

| Content v2.1 input | Proposed v1 output | Local handling |
| --- | --- | --- |
| `offerId`, `contentLanguage`, `feedLabel` | Same fields on ProductInput | Required identity; offer ID whitespace normalized with a warning; two-letter ISO language; label 1–20 A–Z, 0–9, hyphen/underscore |
| `channel: "online"` | `legacyLocal: false` | `channel` itself is not sent |
| `targetCountry` without `feedLabel` | Country used as a candidate `feedLabel` | Always review: a label does not configure country targeting; verify the data source |
| `title`, `description`, `brand`, `mpn`, `color`, `size`, `material`, `pattern`, `itemGroupId`, `googleProductCategory`, `shippingLabel`, `returnPolicyLabel`, `customLabel0`–`customLabel4` | Same names in `productAttributes` | Type and common length checks; title and description required by this online preflight |
| `link`, `imageLink`, `mobileLink`, `canonicalLink` | Same names in `productAttributes` | Absolute HTTP(S), no embedded credentials or control characters; URLs are never fetched; link and imageLink required |
| `identifierExists`, `adult`, `isBundle` | Same booleans | Explicit false preserved; strings/numbers rejected |
| `availability`, `condition`, `gender`, `ageGroup` | v1 enum strings | Explicit mapping; unknown values rejected; availability required |
| `price`, `salePrice` with `value`, `currency` | `amountMicros`, `currencyCode` | Exact BigInt arithmetic, max six decimals, signed int64 upper bound, non-negative; sale/base currency comparison |
| `gtin` | `gtins: [value]` | String and length only; leading zeros retained |
| `additionalImageLinks`, `productTypes` | Same arrays | Element type/URL validation |
| Any other product or nested price field | Omitted from proposal | Named warning; never silently dropped |

Decimal strings are the preferred input. No floating-point multiplication or rounding is used. Unsafe/overflowing numeric input is blocked; fractional JSON numbers receive a warning because their original decimal precision may already have been lost before conversion. `amountMicros` is serialized as a string, including `"0"`.

Unsupported fields include `shipping`, `salePriceEffectiveDate`, custom attributes, dimensions, destinations, inventory, subscriptions, loyalty, promotions and output-only Content metadata such as `id`. Review warnings are intentional. **Do not insert this partial output over a complete production product until all omitted fields have been reconciled.** A public or multi-client SaaS and a complete Content API adapter are not delivered by this MVP.

Duplicate detection uses normalized `offerId` + `contentLanguage` + `feedLabel` for supported online products. Every colliding row is blocked. Resource names should come from API responses or the documented encoding procedure, not naive concatenation: IDs containing `/`, `%` or `~` require the current base64url form. This MVP does not construct resource names or call delete/patch.

## A sellable 8–12 hour customer sprint

This is an estimate of **hands-on engineering**, conditional on prompt access and a simple existing integration. It is not a promise of account approvals or elapsed completion within 48 hours. Limit the initial project to one customer, one Merchant account, one primary API data source, online products, up to 5,000 SKUs and one existing feed/worker. Limit it to product input mapping and sync diagnostics. Quote local inventory, multiple markets/accounts, complex shipping/loyalty, full platform connectors and account policy issues separately.

| Work | Estimate | Acceptance evidence |
| --- | --- | --- |
| Confirm scope, access and current integration | 1–2 h | Correct account/project/source; existing endpoint and failure logs identified |
| Snapshot and mapping review | 2–3 h | Full source export, input counts, supported/unsupported fields and identity mapping documented |
| Adapt a narrowly scoped customer-owned worker | 3–4 h | Revised request construction, bounded concurrency, useful errors, retry strategy, credentials kept server-side |
| Authorized controlled rollout and handoff | 2–3 h | Sample parity, two completed syncs, processed-product checks, alerting and rollback rehearsed |

Actual source data or permissions may show that the project exceeds the quote. Stop expanding the fixed scope, explain the findings, and agree a specific follow-up before promising delivery. A paid migration service requires customer-specific implementation and testing in addition to this local preview.

## Customer project and authentication preparation

1. Identify the customer's own Google Cloud project and Merchant Center account. Establish who owns and can administer both. Confirm a verified Merchant website and an existing API data source. Native ecommerce integrations may already handle migration through their vendor; verify the custom Content integration exists before selling this service.
2. Prefer adapting the customer's existing integration in their project. Google's compatibility guide says existing authentication keys remain valid. Enable Merchant API in that same project where appropriate; verify credentials actually belong to the project, required `https://www.googleapis.com/auth/content` scope, and current Merchant access. Existing credentials do not remove registration, permissions or scope requirements.
3. A customer-owned in-house automation can use a customer-controlled service account added to that customer's Merchant Center. Use minimal necessary access for routine operations; registration needs Merchant **ADMIN**. Prefer workload identity/attached identities when possible. Never put private keys, client secrets, access tokens or refresh tokens in this browser app, source repository, screenshots or client-side environment variables.
4. A new provider-owned application used across independent customer accounts uses the documented OAuth consent flow. Google says app verification typically takes **3–5 business days**. Do not promise to bypass this process with a shared service account or unverified public app. A customer-owned implementation and a multi-client SaaS are different architectures.
5. Complete the required one-time `accounts.developerRegistration.registerGcp` registration for the dedicated project. Prerequisites include a Merchant account with verified website and ADMIN for the registration identity. Register the appropriate main Merchant account, not every subaccount. Use an existing human technical contact or complete any invitation acceptance. Registration is not supported for test accounts. The docs say calls can proceed within about five minutes after registration.
6. A project's registration and auth do not prove access to another customer's data. Record the exact account, data-source IDs, authorized operation scope and owner contact in the customer delivery notes. Do not store this information in the public demo.

## Stage, verify and roll out

1. Export the original product input **and** data-source settings before changes. Preserve the untouched export and customer-owned adapter version in the customer's controlled storage, with limited access and a retention date. Fetch all pages; a partial export is not a complete backup.
2. Run this preflight locally. Reconcile every error and warning. Preserve offer identities, variants, language and label. Do not invent missing price, GTIN, title, brand or identifiers with an LLM. Confirm currency, targeting, shipping and feed rules with the owner.
3. Build a complete mapping for the agreed production fields, including the unsupported fields needed by that customer. Review a field-by-field diff against the original inputs and the exact target data source. Use unmodified source values where possible.
4. There is no generic non-writing insert validation mode supplied by this MVP. First test pure request generation offline. A controlled live test requires customer authorization and carefully chosen real-account test products/data sources. Registration in a Merchant test account is not available under the cited rules. A separately chosen data source can move an existing product; do not assume it is harmless staging.
5. For an authorized live rollout, pause competing writers, deploy a small agreed batch, inspect API errors and retrieve processed products after propagation. Compare identity, price, currency, stock status, counts and source ownership. Never infer success only from an HTTP response or submitted count. Exclude blocked/review rows until fully resolved.
6. Merchant API does not expose Content's `customBatch`. Use individual calls with bounded concurrency and client-library retry handling. Respect quotas and error classes: retry transient rate-limit/server errors with jitter/backoff, inspect permanent validation/auth failures. Prevent stale retry payloads from overwriting newer price/stock updates. No retry or network worker is part of this MVP.
7. Increase batch size only after parity holds. Complete two successive syncs, ensure no unintended duplicate offers, and document differences in Google processing/approval statuses. Set customer-controlled monitoring for sync failure and stale feeds. AWS Lambda/EventBridge/S3/CloudWatch can host this if needed; adapting the existing customer worker may be faster and cheaper.

## Rollback and handoff

- Agree rollback triggers before the first write: changed price/currency, identity mismatch, source movement, unexpected product disappearance, persistent sync errors or a processing issue requiring investigation.
- Pause the new writer first. Restore the prior **complete product input values** with a tested Merchant API path and the correct data source. Do not replay processed-product responses blindly; they contain output-only/computed fields and may omit original input data.
- Keep a versioned worker build, original source export, account/source configuration and a small tested restoration procedure. The old Content endpoint alone is not a dependable rollback: it already has sunset-related errors and is scheduled for full retirement.
- Undo data-source movements only after confirming the intended owner/source and the platform's update behavior. Avoid mass deletion as rollback. Recheck processed products and downstream feed freshness after restoration.
- Handoff should include customer-owned code/configuration, a secrets location (never the secret itself), full field mapping, sync and alert instructions, unresolved limitations and support scope. Stop/revoke temporary consultant access after handoff as agreed.

## Validation commands

Run `npm test` for the TypeScript tests (`tsx --test src/lib/*.test.ts`). Tests exercise exact money including signed-int64 boundaries and zero, real v1 payload shape, malformed input, required fields, currency and enum rejection, HTTP(S) validation, duplicate identities, lost-precision warnings, unsupported-field visibility, pagination, and synthetic example consistency. The demo has **2 ready / 0 review / 1 blocked** product. No test contacts Google or changes accounts.

The frontend build/typecheck and browser QA are separate project checks. Passing the local test suite does not certify a customer's production migration.

## Official references

| Reference | Last update/publication observed | Verified facts |
| --- | --- | --- |
| [ProductInput v1](https://developers.google.com/merchant/api/reference/rest/products_v1/accounts.productInputs) | 2026-04-08 | `productAttributes`, `legacyLocal`, required identity, resource encoding, processing delay |
| [ProductAttributes v1](https://developers.google.com/merchant/api/reference/rest/products_v1/ProductAttributes) | 2026-09-04 | Field names and availability/condition/gender/age-group enum values |
| [Price](https://developers.google.com/merchant/api/reference/rest/Shared.Types/Price) | 2025-02-25 | String int64 `amountMicros`, ISO 4217 `currencyCode` |
| [productInputs.insert](https://developers.google.com/merchant/api/reference/rest/products_v1/accounts.productInputs/insert) | 2025-09-03 | API data source query parameter, replacement/movement semantics, OAuth scope |
| [Register as a developer](https://developers.google.com/merchant/api/guides/quickstart/registration) | 2026-09-03 | `registerGcp`, verified website, ADMIN, no test-account registration, approximate five-minute activation |
| [Set up authentication](https://developers.google.com/merchant/api/guides/quickstart/authentication) | 2026-09-03 | Customer in-house service account versus multi-client OAuth |
| [Access client accounts](https://developers.google.com/merchant/api/guides/authorization/access-client-accounts) | 2026-09-01 | OAuth verification typically 3–5 business days |
| [Existing authentication during migration](https://developers.google.com/merchant/api/guides/compatibility/configure-api-authentication) | 2026-09-01 | Existing keys remain valid; enable Merchant API in the appropriate project |
| [Migration overview](https://developers.google.com/merchant/api/guides/compatibility/overview) | 2026-09-01 | Changed resources/prices and lack of `customBatch` |
| [Content API deprecation and sunset](https://developers.google.com/shopping-content/guides/deprecation-and-sunset) | 2026-09-10 | Sunset 18 August 2026; intermittent HTTP 410 from 1 September without an extension; full shutdown planned early 2027; platform-managed migration distinction |

These references establish API behavior and a migration trigger. They do not establish market conversion rates, guaranteed delivery time, or guaranteed revenue.
