/**
 * Local Content API v2.1 -> Merchant products/v1 preflight for a deliberately
 * limited subset of online product fields. No requests, credentials or writes.
 * "ready" means the supported local checks passed, not Google approval.
 * Schema references and exclusions: docs/technical-runbook.md.
 */
export type ProductStatus = "ready" | "review" | "blocked";
export type ProductIssue = {
  level: "error" | "warning";
  field: string;
  message: string;
};
export type ProductResult = {
  sourceIndex: number;
  offerId: string;
  status: ProductStatus;
  payload: Record<string, unknown> | null;
  issues: ProductIssue[];
};
export type MigrationReport = {
  results: ProductResult[];
  summary: { total: number; ready: number; review: number; blocked: number };
};

type JsonObject = Record<string, unknown>;
const INT64_MAX = 9_223_372_036_854_775_807n;
const OWN = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const LANGUAGES = new Set(
  "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(
    " ",
  ),
);
// ISO 4217 currency codes; a code's presence does not establish support in a
// particular destination/country. Google performs those account-level checks.
const CURRENCIES = new Set(
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XUA YER ZAR ZMW ZWG".split(
    " ",
  ),
);

const STRING_FIELDS: Record<string, number> = {
  title: 150,
  description: 5000,
  brand: 70,
  mpn: 70,
  color: 100,
  size: 100,
  material: 200,
  pattern: 100,
  itemGroupId: 50,
  googleProductCategory: 750,
  shippingLabel: 100,
  returnPolicyLabel: 100,
  customLabel0: 100,
  customLabel1: 100,
  customLabel2: 100,
  customLabel3: 100,
  customLabel4: 100,
};
const URL_FIELDS = [
  "link",
  "imageLink",
  "mobileLink",
  "canonicalLink",
] as const;
const BOOLEAN_FIELDS = ["identifierExists", "adult", "isBundle"] as const;
const ENUMS: Record<string, Record<string, string>> = {
  availability: {
    "in stock": "IN_STOCK",
    "out of stock": "OUT_OF_STOCK",
    preorder: "PREORDER",
    backorder: "BACKORDER",
    "limited availability": "LIMITED_AVAILABILITY",
  },
  condition: { new: "NEW", used: "USED", refurbished: "REFURBISHED" },
  gender: { male: "MALE", female: "FEMALE", unisex: "UNISEX" },
  ageGroup: {
    newborn: "NEWBORN",
    infant: "INFANT",
    toddler: "TODDLER",
    kids: "KIDS",
    adult: "ADULT",
  },
};
const SUPPORTED_FIELDS = new Set([
  "offerId",
  "contentLanguage",
  "feedLabel",
  "targetCountry",
  "channel",
  "price",
  "salePrice",
  "gtin",
  "additionalImageLinks",
  "productTypes",
  ...Object.keys(STRING_FIELDS),
  ...URL_FIELDS,
  ...BOOLEAN_FIELDS,
  ...Object.keys(ENUMS),
]);

function isObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidResult(
  sourceIndex: number,
  field: string,
  message: string,
): ProductResult {
  return {
    sourceIndex,
    offerId: "",
    status: "blocked",
    payload: null,
    issues: [{ level: "error", field, message }],
  };
}

function finish(result: ProductResult): ProductResult {
  result.status = result.issues.some((issue) => issue.level === "error")
    ? "blocked"
    : result.issues.length
      ? "review"
      : "ready";
  if (result.status === "blocked") result.payload = null;
  return result;
}

function summarize(results: ProductResult[]): MigrationReport {
  const summary = { total: results.length, ready: 0, review: 0, blocked: 0 };
  for (const result of results) summary[result.status]++;
  return { results, summary };
}

/** Converts only supported fields; every omitted input field receives a warning. */
export function analyzeProducts(input: unknown): MigrationReport {
  let products: unknown[];
  const wrapperIssues: ProductIssue[] = [];
  if (Array.isArray(input)) {
    products = input;
  } else if (isObject(input) && OWN(input, "resources")) {
    if (!Array.isArray(input.resources)) {
      return summarize([
        invalidResult(
          0,
          "resources",
          "Expected a resources array containing Content API products.",
        ),
      ]);
    }
    products = input.resources;
    for (const key of Object.keys(input)) {
      if (key === "resources") continue;
      wrapperIssues.push({
        level: "warning",
        field: `$.${key}`,
        message:
          key === "nextPageToken"
            ? "A pagination token is present. This export may be incomplete; retrieve and inspect the remaining pages."
            : "This export-wrapper field is not carried into ProductInput payloads. Review the original export.",
      });
    }
  } else if (isObject(input)) {
    products = [input];
  } else {
    return summarize([
      invalidResult(
        0,
        "$",
        "Expected a product object, an array, or an object with a resources array.",
      ),
    ]);
  }
  if (products.length === 0) {
    return summarize([
      invalidResult(
        0,
        "$",
        "No products found. Provide at least one Content API product.",
      ),
    ]);
  }

  const seen = new Map<string, number[]>();
  const results = products.map((product, sourceIndex): ProductResult => {
    if (!isObject(product))
      return invalidResult(
        sourceIndex,
        "$",
        "Each product must be a JSON object, not null, an array, or a primitive.",
      );
    const issues: ProductIssue[] = wrapperIssues.map((issue) => ({ ...issue }));
    const add = (
      level: ProductIssue["level"],
      field: string,
      message: string,
    ) => issues.push({ level, field, message });
    const attributes: JsonObject = {};
    const payload: JsonObject = { legacyLocal: false };

    const string = (
      field: string,
      required: boolean,
      max?: number,
    ): string | undefined => {
      const value = product[field];
      if (!OWN(product, field)) {
        if (required)
          add("error", field, "Required for this online-product preflight.");
        return undefined;
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        add("error", field, "Expected a non-empty string.");
        return undefined;
      }
      if (max && [...value].length > max) {
        add("error", field, `Must not exceed ${max} characters.`);
        return undefined;
      }
      return value;
    };

    let offerId = string("offerId", true, 50);
    if (offerId !== undefined) {
      const normalized = offerId.trim().replace(/\s+/gu, " ");
      if (normalized !== offerId)
        add(
          "warning",
          "offerId",
          "Whitespace was normalized as Merchant API does. Check existing offer identity before use.",
        );
      offerId = normalized;
      if (/[\u0000-\u001f\u007f]/u.test(offerId))
        add(
          "error",
          "offerId",
          "Control characters are not allowed in an offer ID.",
        );
      payload.offerId = offerId;
    }
    const language = string("contentLanguage", true);
    if (language !== undefined) {
      if (!LANGUAGES.has(language))
        add(
          "error",
          "contentLanguage",
          "Use a lowercase two-letter ISO 639-1 language code, such as en.",
        );
      else payload.contentLanguage = language;
    }
    let feedLabel = string("feedLabel", !OWN(product, "targetCountry"));
    if (OWN(product, "targetCountry")) {
      const country = string("targetCountry", true);
      if (country && !/^[A-Z]{2}$/u.test(country))
        add(
          "error",
          "targetCountry",
          "Expected a two-letter uppercase country code.",
        );
      if (!OWN(product, "feedLabel") && country && /^[A-Z]{2}$/u.test(country))
        feedLabel = country;
      add(
        "warning",
        "targetCountry",
        "Country targeting belongs to data-source settings. A country-derived feedLabel is only an identifier; confirm data-source countries manually.",
      );
    }
    if (feedLabel !== undefined) {
      if (!/^[A-Z0-9_-]{1,20}$/u.test(feedLabel))
        add(
          "error",
          "feedLabel",
          "Use 1–20 uppercase letters, digits, hyphens or underscores, with no spaces.",
        );
      else payload.feedLabel = feedLabel;
    }
    const channel = string("channel", true);
    if (channel === "local")
      add(
        "error",
        "channel",
        "Legacy local products are outside this MVP scope. Their identity and inventory need a separate migration.",
      );
    else if (channel !== undefined && channel !== "online")
      add("error", "channel", "Expected Content API channel online or local.");

    for (const [field, max] of Object.entries(STRING_FIELDS)) {
      const value = string(
        field,
        field === "title" || field === "description",
        max,
      );
      if (value !== undefined) attributes[field] = value;
    }

    const safeUrl = (value: unknown, field: string): string | undefined => {
      if (
        typeof value !== "string" ||
        !/^https?:\/\//iu.test(value) ||
        /[\s\u0000-\u001f\u007f\\]/u.test(value)
      ) {
        add(
          "error",
          field,
          "Expected an absolute http:// or https:// URL without whitespace or control characters.",
        );
        return undefined;
      }
      try {
        const url = new URL(value);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          !url.hostname ||
          url.username ||
          url.password
        )
          throw new Error("Unsafe URL");
        return value;
      } catch {
        add("error", field, "URL is invalid or contains embedded credentials.");
        return undefined;
      }
    };
    for (const field of URL_FIELDS) {
      if (!OWN(product, field)) {
        if (field === "link" || field === "imageLink")
          add("error", field, "Required for this online-product preflight.");
        continue;
      }
      const value = safeUrl(product[field], field);
      if (value !== undefined) attributes[field] = value;
    }
    for (const field of BOOLEAN_FIELDS) {
      if (!OWN(product, field)) continue;
      if (typeof product[field] !== "boolean")
        add("error", field, "Expected a boolean, not a string or number.");
      else attributes[field] = product[field];
    }
    for (const [field, allowed] of Object.entries(ENUMS)) {
      if (!OWN(product, field)) {
        if (field === "availability")
          add("error", field, "Required for this online-product preflight.");
        continue;
      }
      const value = product[field];
      if (typeof value !== "string" || !OWN(allowed, value))
        add(
          "error",
          field,
          `Expected a Content API value: ${Object.keys(allowed).join(", ")}.`,
        );
      else attributes[field] = allowed[value];
    }

    const price = (field: "price" | "salePrice"): JsonObject | undefined => {
      if (!OWN(product, field)) {
        if (field === "price")
          add("error", field, "A price with value and currency is required.");
        return undefined;
      }
      const value = product[field];
      if (!isObject(value)) {
        add(
          "error",
          field,
          "Expected an object with decimal value and ISO currency.",
        );
        return undefined;
      }
      for (const key of Object.keys(value)) {
        if (key !== "value" && key !== "currency")
          add(
            "warning",
            `${field}.${key}`,
            "Unsupported nested price field omitted; review the original price object.",
          );
      }
      let decimal: string | undefined;
      if (typeof value.value === "string") decimal = value.value;
      else if (
        typeof value.value === "number" &&
        Number.isFinite(value.value) &&
        Math.abs(value.value) <= Number.MAX_SAFE_INTEGER
      ) {
        decimal = String(value.value);
        if (!Number.isSafeInteger(value.value))
          add(
            "warning",
            `${field}.value`,
            "A JSON number may already have lost decimal precision. Export money as a decimal string before production use.",
          );
      }
      let micros: bigint | undefined;
      if (
        decimal === undefined ||
        !/^\d+(?:\.\d{1,6})?$/u.test(decimal) ||
        decimal.length > 40
      ) {
        add(
          "error",
          `${field}.value`,
          "Use a non-negative plain decimal with at most six fractional digits; no rounding, exponent notation or separators. Prefer a string.",
        );
      } else {
        const [whole, fraction = ""] = decimal.split(".");
        micros = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
        if (micros > INT64_MAX) {
          add(
            "error",
            `${field}.value`,
            "Price exceeds the signed int64 amountMicros limit.",
          );
          micros = undefined;
        }
      }
      const currency = value.currency;
      if (typeof currency !== "string" || !CURRENCIES.has(currency))
        add(
          "error",
          `${field}.currency`,
          "Expected a recognized uppercase ISO 4217 currency code, such as USD or EUR.",
        );
      if (
        micros === undefined ||
        typeof currency !== "string" ||
        !CURRENCIES.has(currency)
      )
        return undefined;
      return { amountMicros: micros.toString(), currencyCode: currency };
    };
    const basePrice = price("price");
    const salePrice = price("salePrice");
    if (basePrice) attributes.price = basePrice;
    if (salePrice) {
      attributes.salePrice = salePrice;
      if (basePrice && basePrice.currencyCode !== salePrice.currencyCode)
        add(
          "error",
          "salePrice.currency",
          "Sale price and base price must use the same currency.",
        );
      if (
        basePrice &&
        BigInt(salePrice.amountMicros as string) >
          BigInt(basePrice.amountMicros as string)
      )
        add(
          "error",
          "salePrice.value",
          "Sale price must not exceed the base price.",
        );
    }
    if (OWN(product, "gtin")) {
      const gtin = product.gtin;
      if (
        typeof gtin !== "string" ||
        !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/u.test(gtin)
      )
        add(
          "error",
          "gtin",
          "Expected an 8, 12, 13 or 14 digit GTIN string. Preserve leading zeroes.",
        );
      else attributes.gtins = [gtin];
    }
    for (const field of ["additionalImageLinks", "productTypes"] as const) {
      if (!OWN(product, field)) continue;
      const values = product[field];
      if (!Array.isArray(values)) {
        add("error", field, "Expected an array of strings.");
        continue;
      }
      const converted: string[] = [];
      values.forEach((value, index) => {
        if (field === "additionalImageLinks") {
          const url = safeUrl(value, `${field}[${index}]`);
          if (url !== undefined) converted.push(url);
        } else if (typeof value !== "string" || value.trim().length === 0)
          add("error", `${field}[${index}]`, "Expected a non-empty string.");
        else converted.push(value);
      });
      attributes[field] = converted;
    }

    for (const field of Object.keys(product)) {
      if (!SUPPORTED_FIELDS.has(field))
        add(
          "warning",
          field,
          "Not supported by this limited converter; omitted from the proposed payload. Review and migrate this field manually.",
        );
    }
    payload.productAttributes = attributes;
    // JSON tuple avoids delimiter collisions for legitimate offer IDs containing ~.
    if (
      channel === "online" &&
      typeof payload.offerId === "string" &&
      typeof payload.feedLabel === "string" &&
      typeof payload.contentLanguage === "string"
    ) {
      const identity = JSON.stringify([
        payload.contentLanguage,
        payload.feedLabel,
        payload.offerId,
      ]);
      const indexes = seen.get(identity) ?? [];
      indexes.push(sourceIndex);
      seen.set(identity, indexes);
    }
    return finish({
      sourceIndex,
      offerId: offerId ?? "",
      status: "ready",
      payload,
      issues,
    });
  });

  for (const indexes of seen.values()) {
    if (indexes.length < 2) continue;
    const rows =
      indexes
        .slice(0, 10)
        .map((i) => i + 1)
        .join(", ") +
      (indexes.length > 10 ? ` and ${indexes.length - 10} more` : "");
    for (const index of indexes) {
      results[index].issues.push({
        level: "error",
        field: "offerId",
        message: `Duplicate offer identity (language + feedLabel + normalized offerId) in input rows ${rows}. Resolve before any insert.`,
      });
      finish(results[index]);
    }
  }
  return summarize(results);
}

/** Deliberately synthetic: example.com URLs are never fetched. */
export const SAMPLE_CONTENT_PRODUCTS = [
  {
    offerId: "DEMO-MUG-01",
    channel: "online",
    contentLanguage: "en",
    feedLabel: "US",
    title: "Demo ceramic mug",
    description: "Synthetic product for a local migration preview.",
    link: "https://example.com/products/demo-mug",
    imageLink: "https://example.com/images/demo-mug.jpg",
    availability: "in stock",
    condition: "new",
    brand: "Demo Brand",
    price: { value: "24.95", currency: "USD" },
  },
  {
    offerId: "DEMO-TOTE-02",
    channel: "online",
    contentLanguage: "en",
    feedLabel: "GB",
    title: "Demo cotton tote",
    description: "Synthetic product for a local migration preview.",
    link: "https://example.com/products/demo-tote",
    imageLink: "https://example.com/images/demo-tote.jpg",
    availability: "out of stock",
    condition: "new",
    brand: "Demo Brand",
    price: { value: "19.00", currency: "GBP" },
  },
  {
    offerId: "DEMO-REVIEW-03",
    channel: "online",
    contentLanguage: "en",
    feedLabel: "US",
    title: "Demo item with a broken price",
    description: "Intentional invalid input for the demo.",
    link: "https://example.com/products/demo-invalid",
    imageLink: "https://example.com/images/demo-invalid.jpg",
    availability: "in stock",
    price: { value: "not-a-price", currency: "USD" },
  },
];
