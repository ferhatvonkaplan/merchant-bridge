export interface IntegrationAnswers {
  setup: "custom" | "platform" | "unsure";
  contentApi: "yes" | "no" | "unsure";
  products: number;
  sources: "one" | "multiple";
  markets: "one" | "multiple";
  projectReady: "yes" | "no";
}

export interface Assessment {
  kind: "candidate" | "platform" | "discovery";
  title: string;
  description: string;
  nextSteps: string[];
}

export function assessIntegration(answers: IntegrationAnswers): Assessment {
  if (!Number.isInteger(answers.products) || answers.products < 1) {
    throw new Error("Enter a whole number of products greater than zero.");
  }
  if (answers.setup === "platform")
    return {
      kind: "platform",
      title: "Start with your platform provider.",
      description:
        "If your platform manages the Google connection, it also manages this API migration. This sprint may not be needed.",
      nextSteps: [
        "Ask your platform or feed provider whether its connection is already on Merchant API.",
        "If you also run a separate custom integration, assess that connection separately.",
      ],
    };
  const reasons: string[] = [];
  if (answers.setup === "unsure" || answers.contentApi === "unsure")
    reasons.push(
      "Confirm whether the custom connector calls Content API for Shopping.",
    );
  if (answers.contentApi === "no")
    reasons.push(
      "Check which API the connector uses; it may already be on Merchant API.",
    );
  if (answers.products > 5000)
    reasons.push(
      "Scope a larger catalog separately; this package covers up to 5,000 existing SKUs.",
    );
  if (answers.sources === "multiple")
    reasons.push(
      "Choose one source for the sprint, or scope the additional connectors separately.",
    );
  if (answers.markets === "multiple")
    reasons.push("Choose one market and language flow for the sprint.");
  if (reasons.length > 0)
    return {
      kind: "discovery",
      title: "A little scoping comes first.",
      description:
        "Your answers need a closer look before a fixed price or delivery date can be confirmed.",
      nextSteps: reasons,
    };
  return {
    kind: "candidate",
    title: "A focused sprint looks possible.",
    description:
      "Your answers fit the initial package boundaries. A connector review must still confirm the 8–12 hour engineering scope.",
    nextSteps: [
      "Prepare a redacted product sample and a list of the existing API operations.",
      answers.projectReady === "yes"
        ? "Confirm the existing Cloud project, Merchant account administrator, and technical owner."
        : "Arrange the existing Cloud project and Merchant administrator before the delivery clock starts.",
      "Agree the exact scope before the $625 initial payment; the $625 balance follows technical acceptance.",
    ],
  };
}

export function createBrief(
  answers: IntegrationAnswers,
  assessment: Assessment,
): string {
  return [
    "# Merchant Bridge — migration brief",
    "",
    "Self-reported scope; not a confirmed quote or a live account assessment.",
    "",
    `Integration: ${answers.setup}`,
    `Calls Content API: ${answers.contentApi}`,
    `Existing products: ${answers.products}`,
    `Data sources: ${answers.sources}`,
    `Markets/language flows: ${answers.markets}`,
    `Existing project and Merchant admin available: ${answers.projectReady}`,
    "",
    `Assessment: ${assessment.title}`,
    assessment.description,
    "",
    "## Next steps",
    ...assessment.nextSteps.map((step) => `- ${step}`),
    "",
    "## Package boundaries",
    "USD 1,250: one Merchant account, one custom source, one market/language flow, up to 5,000 existing SKUs.",
    "Subject to an 8–12 hour engineering scope confirmed after inspecting the connector.",
    "Target: two business days after scope agreement and required access are ready.",
    "USD 625 on scope agreement; USD 625 after technical acceptance.",
    "Product approval, policy appeals, new platform integrations, and expanded scope are not included.",
    "",
    "## Official reference",
    "https://developers.google.com/shopping-content/guides/deprecation-and-sunset",
    "",
    "Do not put API keys, passwords, customer records, or unredacted logs in this brief.",
  ].join("\n");
}
