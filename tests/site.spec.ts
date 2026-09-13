import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Object-storage hosting serves an explicit /index.html entry point.
const home = process.env.MERCHANT_BRIDGE_TEST_URL || "/";

test("sample checker maps valid products and blocks the deliberate data issue", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(home);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Merchant API",
  );
  await page.getByRole("button", { name: "Run sample check" }).click();
  await expect(page.locator(".review-summary")).toContainText(
    "2Mapped0To review1Blocked",
  );
  await expect(page.locator(".product-result")).toHaveCount(3);
  await page.locator(".product-result").last().locator("summary").click();
  await expect(page.locator(".product-result").last()).toContainText("price");
  expect(errors).toEqual([]);
});

test("invalid JSON clears any old result and produces a useful error", async ({
  page,
}) => {
  await page.goto(home);
  await page.getByRole("button", { name: "Run sample check" }).click();
  await page.getByLabel("Content API product JSON").fill("{bad json");
  await page.getByRole("button", { name: "Run sample check" }).click();
  await expect(page.getByRole("alert")).toContainText("not valid JSON");
  await expect(page.locator(".product-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset sample" }).click();
  await page.getByRole("button", { name: "Run sample check" }).click();
  await expect(page.locator(".product-result")).toHaveCount(3);
});

test("export contains a review report and explicitly avoids claiming Google validation", async ({
  page,
}) => {
  await page.goto(home);
  await page.getByRole("button", { name: "Run sample check" }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export product review" }).click();
  const download = await event;
  expect(download.suggestedFilename()).toBe(
    "merchant-bridge-product-review.json",
  );
  const stream = await download.createReadStream();
  let contents = "";
  for await (const chunk of stream!) contents += chunk.toString();
  const report = JSON.parse(contents);
  expect(report.googleValidated).toBe(false);
  expect(report.summary.ready).toBe(2);
  expect(
    report.results[0].payload.productAttributes.price.amountMicros,
  ).toBeDefined();
  expect(report.results[2].payload).toBeNull();
});

test("integration assessment produces a conditional brief and working project-inquiry link", async ({
  page,
}) => {
  await page.goto(home);
  await page
    .getByRole("button", { name: "Check your integration" })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Review my scope" }).click();
  await expect(
    page.getByRole("heading", { name: "A focused sprint looks possible." }),
  ).toBeVisible();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my brief" }).click();
  const stream = await (await event).createReadStream();
  let brief = "";
  for await (const chunk of stream!) brief += chunk.toString();
  expect(brief).toContain("not a confirmed quote");
  expect(brief).toContain("required access are ready");
  await expect(
    page.getByRole("link", { name: "Start a public GitHub inquiry" }),
  ).toHaveAttribute(
    "href",
    /github.com\/ferhatvonkaplan\/merchant-bridge\/issues\/new/,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("platform-managed connection is referred to its provider without a sales inquiry", async ({
  page,
}) => {
  await page.goto(home);
  await page
    .getByRole("button", { name: "Check your integration" })
    .first()
    .click();
  await page
    .getByLabel("Who manages your Google connection?")
    .selectOption("platform");
  await page.getByRole("button", { name: "Review my scope" }).click();
  await expect(
    page.getByRole("heading", { name: "Start with your platform provider." }),
  ).toBeVisible();
  await expect(page.locator(".brief-price")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Start a public GitHub inquiry" }),
  ).toHaveCount(0);
});

test("out-of-scope catalog requires discovery and the public checklist is available", async ({
  page,
  request,
}) => {
  await page.goto(home);
  await page
    .getByRole("button", { name: "Check your integration" })
    .first()
    .click();
  await page.getByLabel("Existing product SKUs").fill("6000");
  await page.getByRole("button", { name: "Review my scope" }).click();
  await expect(
    page.getByRole("heading", { name: "A little scoping comes first." }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("larger catalog");
  const response = await request.get("/merchant-migration-checklist.md");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("Merchant");
});

test("mobile navigation, checker and dialog fit a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(home);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: /Try the checker/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Run sample check" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Check your integration" })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});

test("landing page has no serious or critical accessibility violations", async ({
  page,
}) => {
  await page.goto(home);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});

test("assessment dialog remains accessible", async ({ page }) => {
  await page.goto(home);
  await page
    .getByRole("button", { name: "Check your integration" })
    .first()
    .click();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});

test("product results and the generated brief retain accessible contrast", async ({
  page,
}) => {
  await page.goto(home);
  await page.getByRole("button", { name: "Run sample check" }).click();
  await page.locator(".product-result").last().locator("summary").click();
  const products = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    products.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Check your integration" })
    .first()
    .click();
  await page.getByRole("button", { name: "Review my scope" }).click();
  const brief = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    brief.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});
