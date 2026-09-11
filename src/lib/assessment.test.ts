import test from "node:test";
import assert from "node:assert/strict";
import {
  assessIntegration,
  createBrief,
  type IntegrationAnswers,
} from "./assessment.ts";

const base: IntegrationAnswers = {
  setup: "custom",
  contentApi: "yes",
  products: 400,
  sources: "one",
  markets: "one",
  projectReady: "yes",
};
test("a platform-managed connection is referred to its provider, not sold a sprint", () => {
  assert.equal(
    assessIntegration({ ...base, setup: "platform" }).kind,
    "platform",
  );
});
test("a narrow custom integration remains conditional on a connector review", () => {
  const result = assessIntegration(base);
  assert.equal(result.kind, "candidate");
  assert.match(result.description, /review must still confirm/);
});
test("catalog, source, and market limits require separate scoping", () => {
  for (const change of [
    { products: 5001 },
    { sources: "multiple" },
    { markets: "multiple" },
  ] as Partial<IntegrationAnswers>[]) {
    assert.equal(assessIntegration({ ...base, ...change }).kind, "discovery");
  }
});
test("not using Content API does not qualify for a migration", () => {
  assert.equal(
    assessIntegration({ ...base, contentApi: "no" }).kind,
    "discovery",
  );
});
test("invalid counts cannot create a misleading brief", () => {
  for (const products of [NaN, Infinity, -1, 0, 1.5])
    assert.throws(() => assessIntegration({ ...base, products }));
});
test("brief retains payment and readiness conditions", () => {
  const answers = { ...base, projectReady: "no" as const };
  const brief = createBrief(answers, assessIntegration(answers));
  assert.match(brief, /not a confirmed quote/);
  assert.match(brief, /required access are ready/);
  assert.match(brief, /USD 625 after technical acceptance/);
});
