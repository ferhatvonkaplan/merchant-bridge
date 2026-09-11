import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";

mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.goto(process.env.INSPECT_URL || "http://127.0.0.1:4173");
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
const report = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  .analyze();
writeFileSync(
  "artifacts/accessibility.json",
  JSON.stringify(report.violations, null, 2),
);
console.log(
  "Accessibility:",
  JSON.stringify(
    report.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
    })),
  ),
);
const colors = report.violations
  .filter((v) => v.id === "color-contrast")
  .flatMap((v) =>
    v.nodes.map((n) => ({
      target: n.target,
      data: n.any.find((a) => a.id === "color-contrast")?.data,
    })),
  );
writeFileSync("artifacts/contrast.json", JSON.stringify(colors, null, 2));
console.log(
  "Failing foreground colors:",
  [...new Set(colors.map((n) => n.data?.fgColor))].join(" "),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(process.env.INSPECT_URL || "http://127.0.0.1:4173");
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
console.log(
  "Overflow:",
  await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > innerWidth + 1 &&
          getComputedStyle(el).position !== "absolute",
      )
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        right: el.getBoundingClientRect().right,
      }))
      .slice(0, 12),
  })),
);
await browser.close();
