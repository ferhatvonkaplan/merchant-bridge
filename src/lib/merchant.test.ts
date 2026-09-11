import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeProducts, SAMPLE_CONTENT_PRODUCTS } from "./merchant.ts";

function product(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...structuredClone(SAMPLE_CONTENT_PRODUCTS[0]), ...overrides };
}

function attributes(input: unknown): Record<string, unknown> {
  const result = analyzeProducts(input).results[0];
  assert.ok(result.payload, JSON.stringify(result.issues));
  return result.payload.productAttributes as Record<string, unknown>;
}

test("synthetic demo exposes two ready products and one blocked price", () => {
  const report = analyzeProducts(SAMPLE_CONTENT_PRODUCTS);
  assert.deepEqual(report.summary, {
    total: 3,
    ready: 2,
    review: 0,
    blocked: 1,
  });
  assert.equal(report.results[2].payload, null);
  assert.ok(
    report.results[2].issues.some((issue) => issue.field === "price.value"),
  );
  const downloaded = JSON.parse(
    readFileSync(
      new URL(
        "../../public/examples/content-api-products.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(downloaded, SAMPLE_CONTENT_PRODUCTS);
});

test("emits current v1 productAttributes and legacyLocal; channel never leaks into payload", () => {
  const result = analyzeProducts(product()).results[0];
  assert.equal(result.status, "ready");
  assert.deepEqual(result.payload, {
    legacyLocal: false,
    offerId: "DEMO-MUG-01",
    contentLanguage: "en",
    feedLabel: "US",
    productAttributes: {
      title: "Demo ceramic mug",
      description: "Synthetic product for a local migration preview.",
      brand: "Demo Brand",
      link: "https://example.com/products/demo-mug",
      imageLink: "https://example.com/images/demo-mug.jpg",
      availability: "IN_STOCK",
      condition: "NEW",
      price: { amountMicros: "24950000", currencyCode: "USD" },
    },
  });
});

test("supports a single product, arrays and resources wrappers without mutating input", () => {
  const input = product();
  const before = structuredClone(input);
  const single = analyzeProducts(input);
  assert.deepEqual(single, analyzeProducts([input]));
  assert.deepEqual(single, analyzeProducts({ resources: [input] }));
  assert.deepEqual(input, before);
});

test("malformed roots and malformed array elements produce diagnostic rows", () => {
  for (const input of [
    null,
    undefined,
    4,
    "text",
    true,
    new Date(),
    { resources: null },
    { resources: {} },
    [],
  ]) {
    const report = analyzeProducts(input);
    assert.equal(report.summary.blocked, 1);
    assert.equal(report.results[0].payload, null);
  }
  const report = analyzeProducts([product(), null, [], "text"]);
  assert.equal(report.summary.total, 4);
  assert.equal(report.summary.ready, 1);
  assert.equal(report.summary.blocked, 3);
  assert.equal(report.results[3].sourceIndex, 3);
});

test("all required online fields are checked, including null and wrong types", () => {
  for (const field of [
    "offerId",
    "contentLanguage",
    "feedLabel",
    "channel",
    "title",
    "description",
    "link",
    "imageLink",
    "availability",
    "price",
  ]) {
    const input = product();
    delete input[field];
    const result = analyzeProducts(input).results[0];
    assert.equal(result.status, "blocked", field);
    assert.ok(
      result.issues.some(
        (issue) => issue.field === field && issue.level === "error",
      ),
      field,
    );
  }
  for (const title of [null, "", " ", 15, {}, []]) {
    assert.equal(
      analyzeProducts(product({ title })).results[0].status,
      "blocked",
    );
  }
});

test("converts decimal money exactly, including tiny prices, zeros and int64 maximum", () => {
  const cases: [string | number, string][] = [
    ["0", "0"],
    [0, "0"],
    ["0.000001", "1"],
    ["0.1", "100000"],
    ["19.99", "19990000"],
    ["00012.3400", "12340000"],
    ["9223372036854.775807", "9223372036854775807"],
  ];
  for (const [value, amountMicros] of cases) {
    const input = product({ price: { value, currency: "USD" } });
    assert.deepEqual(attributes(input).price, {
      amountMicros,
      currencyCode: "USD",
    });
    assert.equal(analyzeProducts(input).results[0].status, "ready");
  }
});

test("rejects invalid precision and overflows instead of rounding or floating-point multiplication", () => {
  for (const value of [
    "-1",
    "-0.01",
    "1e3",
    "1,234.00",
    " 2 ",
    "1.",
    ".1",
    "NaN",
    "Infinity",
    "0.0000001",
    "9223372036854.775808",
    "9".repeat(100),
    NaN,
    Infinity,
    9007199254740992,
    null,
    {},
  ]) {
    const result = analyzeProducts(
      product({ price: { value, currency: "USD" } }),
    ).results[0];
    assert.equal(result.status, "blocked", String(value));
    assert.ok(result.issues.some((issue) => issue.field === "price.value"));
  }
});

test("decimal JSON numbers are converted but explicitly require precision review", () => {
  const result = analyzeProducts(
    product({ price: { value: 0.29, currency: "USD" } }),
  ).results[0];
  assert.equal(result.status, "review");
  assert.deepEqual(
    (result.payload?.productAttributes as Record<string, unknown>).price,
    { amountMicros: "290000", currencyCode: "USD" },
  );
});

test("recognizes currencies and reports malformed nested prices and unknown nested fields", () => {
  for (const currency of ["ZZZ", "usd", "US", "", null, 123]) {
    assert.equal(
      analyzeProducts(product({ price: { value: "1", currency } })).results[0]
        .status,
      "blocked",
    );
  }
  for (const price of [null, [], "10 USD", {}]) {
    assert.equal(
      analyzeProducts(product({ price })).results[0].status,
      "blocked",
    );
  }
  const result = analyzeProducts(
    product({ price: { value: "1", currency: "USD", tax: "0.1" } }),
  ).results[0];
  assert.equal(result.status, "review");
  assert.ok(result.issues.some((issue) => issue.field === "price.tax"));
});

test("sale prices must retain base currency and not exceed base price", () => {
  assert.deepEqual(
    attributes(product({ salePrice: { value: "0", currency: "USD" } }))
      .salePrice,
    { amountMicros: "0", currencyCode: "USD" },
  );
  assert.equal(
    analyzeProducts(product({ salePrice: { value: "25", currency: "USD" } }))
      .results[0].status,
    "blocked",
  );
  assert.equal(
    analyzeProducts(product({ salePrice: { value: "10", currency: "EUR" } }))
      .results[0].status,
    "blocked",
  );
});

test("URLs must be explicit http(s), valid and free from embedded credentials", () => {
  for (const link of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com",
    "/product",
    "https://user:pass@example.com",
    "https://",
    "https://example.com/ white",
    "https://example.com/\npath",
    "https://example.com\\@evil.test",
    null,
    1,
  ]) {
    assert.equal(
      analyzeProducts(product({ link })).results[0].status,
      "blocked",
      String(link),
    );
  }
  assert.equal(
    analyzeProducts(
      product({ link: "http://example.com/products/a%20b?color=red#details" }),
    ).results[0].status,
    "ready",
  );
  assert.equal(
    analyzeProducts(product({ additionalImageLinks: ["javascript:alert(1)"] }))
      .results[0].status,
    "blocked",
  );
});

test("validates source enums instead of silently defaulting unknown values", () => {
  for (const [field, value] of [
    ["availability", "available"],
    ["condition", "excellent"],
    ["gender", "unknown"],
    ["ageGroup", "teen"],
  ]) {
    assert.equal(
      analyzeProducts(product({ [field]: value })).results[0].status,
      "blocked",
    );
  }
  const output = attributes(
    product({
      availability: "backorder",
      condition: "refurbished",
      gender: "unisex",
      ageGroup: "adult",
    }),
  );
  assert.equal(output.availability, "BACKORDER");
  assert.equal(output.condition, "REFURBISHED");
  assert.equal(output.gender, "UNISEX");
  assert.equal(output.ageGroup, "ADULT");
});

test("preserves explicit false booleans and GTIN leading zeros", () => {
  const output = attributes(
    product({
      identifierExists: false,
      adult: false,
      isBundle: false,
      gtin: "00012345678905",
    }),
  );
  assert.equal(output.identifierExists, false);
  assert.equal(output.adult, false);
  assert.equal(output.isBundle, false);
  assert.deepEqual(output.gtins, ["00012345678905"]);
  assert.equal(
    analyzeProducts(product({ adult: "false" })).results[0].status,
    "blocked",
  );
  assert.equal(
    analyzeProducts(product({ gtin: 123456789012 })).results[0].status,
    "blocked",
  );
});

test("every unsupported product field requires review; never silently copy shipping or metadata", () => {
  const input = product({
    shipping: [{ country: "US" }],
    id: "online:en:US:DEMO-MUG-01",
    customAttributes: [{ name: "foo", value: "bar" }],
  });
  const result = analyzeProducts(input).results[0];
  assert.equal(result.status, "review");
  assert.deepEqual(result.issues.map((issue) => issue.field).sort(), [
    "customAttributes",
    "id",
    "shipping",
  ]);
  const output = result.payload?.productAttributes as Record<string, unknown>;
  assert.equal(output.shipping, undefined);
  assert.equal(output.id, undefined);
});

test("wrapper pagination and metadata are explicitly visible on product rows", () => {
  const report = analyzeProducts({
    resources: [product()],
    nextPageToken: "remaining-page",
    kind: "content#productsListResponse",
  });
  assert.equal(report.results[0].status, "review");
  assert.ok(
    report.results[0].issues.some(
      (issue) =>
        issue.field === "$.nextPageToken" && /incomplete/u.test(issue.message),
    ),
  );
  assert.ok(report.results[0].issues.some((issue) => issue.field === "$.kind"));
});

test("duplicates block every colliding offer, accounting for normalized whitespace", () => {
  const report = analyzeProducts([
    product(),
    product({ offerId: " DEMO-MUG-01 " }),
    product({ offerId: "different" }),
  ]);
  assert.deepEqual(report.summary, {
    total: 3,
    ready: 1,
    review: 0,
    blocked: 2,
  });
  assert.equal(report.results[0].payload, null);
  assert.equal(report.results[1].payload, null);
  assert.match(report.results[0].issues.at(-1)?.message ?? "", /rows 1, 2/u);
});

test("same offerId in different language or feedLabel is a distinct identity", () => {
  const report = analyzeProducts([
    product(),
    product({ contentLanguage: "de" }),
    product({ feedLabel: "CA" }),
  ]);
  assert.equal(report.summary.ready, 3);
});

test("country fallback always requires manual data-source targeting review", () => {
  const input = product({ targetCountry: "US" });
  delete input.feedLabel;
  const result = analyzeProducts(input).results[0];
  assert.equal(result.status, "review");
  assert.equal(result.payload?.feedLabel, "US");
  assert.equal(result.payload?.targetCountry, undefined);
  for (const overrides of [
    { contentLanguage: "zz" },
    { contentLanguage: "en-US" },
    { feedLabel: "us" },
    { feedLabel: "TOO_LONG_" + "A".repeat(20) },
  ]) {
    assert.equal(
      analyzeProducts(product(overrides)).results[0].status,
      "blocked",
    );
  }
});

test("legacy local inventory is blocked without colliding with an online identity", () => {
  const report = analyzeProducts([product(), product({ channel: "local" })]);
  assert.equal(report.results[0].status, "ready");
  assert.equal(report.results[1].status, "blocked");
  assert.match(report.results[1].issues[0].message, /outside this MVP scope/u);
});
