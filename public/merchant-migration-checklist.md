# Merchant API migration readiness checklist

A practical checklist for teams maintaining a custom product connection to Google Merchant Center.

Prepared by **Merchant Bridge**, an independent development service. Reviewed against Google's documentation on **12 September 2026**. This checklist is not a Google certification or a promise that a merchant's products will be approved.

## 1. Confirm who owns the connection

- [ ] Identify the code or provider that sends product data. Record the existing API methods and a redacted request/error sample.
- [ ] If a commerce platform or feed provider manages the connection, ask that provider about its migration. Its platform-managed connection does not automatically require a separate migration service.
- [ ] If your team owns the Content API connector, identify the technical owner of the code, Merchant Center account, Google Cloud project, and scheduler.

Google's sunset document, updated 10 September 2026, states that Content API for Shopping reached sunset on **18 August 2026**. Requests without an active extension began intermittently returning **HTTP 410 Gone from 1 September 2026**; full decommissioning is planned for early 2027. This is not a statement that every integration stopped working on 18 August. Check the actual client's integration and logs. [1]

## 2. Set a boundary before estimating work

- [ ] Record the Merchant Center account, custom data source, feed label, content language, country, and existing SKU count.
- [ ] List the product operations actually used: create/insert, update, delete, and any read/status operations required by the workflow.
- [ ] Identify `customBatch`, account administration, shipping/tax configuration, multi-account operations, and any other behavior that requires additional migration work.
- [ ] Agree a baseline export, a representative field sample, a safe test method, and the owner who can accept the result.

A small catalog can still have a complex connector. SKU count alone is not enough to set a delivery date. Migration is more than changing a URL. [2]

## 3. Verify project, authorization, and developer registration

- [ ] Identify the existing Google Cloud project and confirm that the authorized client can enable/use Merchant API there.
- [ ] Review the existing OAuth or service-account arrangement for this client's use case. Existing credentials may remain usable, but permissions and the correct authorization flow still need checking. [3, 5]
- [ ] Complete or verify the required `registerGcp` developer registration and the developer contact in Merchant Center. Keep ownership with the client. [4]
- [ ] Verify the operational permissions needed for the work. The API developer contact role is not, by itself, permission to perform every Merchant Center operation.
- [ ] Agree secure handling of credentials. Keep passwords, private keys, and bearer tokens out of emails, public forms, code repositories, and shared reports.

A client's internal automation and a third-party app serving multiple unrelated clients have different authorization requirements. App verification and account approval waiting time should not be disguised as development time. [5]

## 4. Map fields and identities explicitly

- [ ] Use Merchant API v1 resource names and confirm the product identity fields used by the integration. Do not assume a legacy resource identifier can be copied unchanged.
- [ ] Associate product inputs with the correct custom data source, feed label, and content language.
- [ ] Convert prices with decimal/integer arithmetic. In the new price representation, one currency unit equals 1,000,000 `amountMicros`, and the currency field is `currencyCode`.
- [ ] Preserve product facts and required attributes from the source. Report missing or invalid data rather than inventing replacement values.
- [ ] Distinguish a submitted product input from the processed product and its eventual eligibility/status.

For example, a source price of `19.99` USD becomes `amountMicros = 19990000` and `currencyCode = USD`. Verify serialization against the client library or REST schema being used. This example is synthetic. [2]

## 5. Plan request handling and a controlled cutover

- [ ] Replace unsupported `customBatch` behavior with supported individual/asynchronous request handling appropriate to the client's volume. [2]
- [ ] Bound concurrency and transient-error retries. Use backoff for suitable transient failures; do not blindly retry authorization, validation, or HTTP 410 errors.
- [ ] Record a clear outcome per source record, with enough identifiers to investigate failures and no exposed secrets.
- [ ] Identify all competing writers and the scheduler owner. Agree when to pause the previous writer to prevent conflicting updates.
- [ ] Preserve a baseline and code/configuration snapshot. Document a safe pause and recovery procedure; reverting to the sunset API is not assured restoration of service.
- [ ] Use fixtures or explicitly approved records to validate deletion. Never remove production products simply to demonstrate a migration.

## 6. Agree measurable technical acceptance

- [ ] The agreed sample's identifiers, attributes, prices, currency, and source/market mapping match the baseline or an approved correction.
- [ ] Two consecutive sync runs complete in the agreed test window. Every in-scope record has an explained successful, pending, or exception outcome.
- [ ] Differences between source and destination counts are reconciled; count equality by itself is not evidence that every field is correct.
- [ ] Failed records have an actionable report. Integration defects, source-data issues, and Google policy issues are distinguished.
- [ ] Resolve migration-caused failures in the agreed operations. Any retained pre-existing data/policy exceptions are explicitly accepted by the client; a logged failure alone is not a completed migration.
- [ ] The client receives the code/configuration, run instructions, sanitized evidence, known exceptions, and pause/recovery procedure.

**A successful API request does not guarantee Google approval.** Product eligibility, policy decisions, account reinstatement, ad delivery, ranking, and revenue are separate from technical migration acceptance.

## About the Merchant Bridge sprint

The fixed-scope package is **USD 1,250**: USD 625 after written scope agreement and before work, and USD 625 on technical acceptance. It covers **one merchant account, one custom source, one market, and up to 5,000 existing SKUs**.

The delivery target is **two business days after ready access, required source material, and written scope approval**. Only work estimated at approximately **8–12 active development/test hours** qualifies. More complex integrations, additional accounts/markets, platform-managed migration, policy appeals, new multi-client OAuth verification, and ongoing operations are outside this package. External approvals and client waiting time can change the confirmed schedule.

## Primary references

1. [Google — Content API deprecation and sunset](https://developers.google.com/shopping-content/guides/deprecation-and-sunset), last updated 10 September 2026.
2. [Google — Migrate from Content API to Merchant API](https://developers.google.com/merchant/api/guides/compatibility/overview), last updated 1 September 2026.
3. [Google — Configure API authentication](https://developers.google.com/merchant/api/guides/compatibility/configure-api-authentication), last updated 1 September 2026.
4. [Google — Register as a developer](https://developers.google.com/merchant/api/guides/quickstart/registration), last updated 3 September 2026.
5. [Google — Set up authentication](https://developers.google.com/merchant/api/guides/quickstart/authentication).

Consult the current Google documentation before changing a live integration; requirements and retirement milestones can change.
