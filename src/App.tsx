import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clipboard,
  Code2,
  FileJson,
  GitBranch,
  Layers3,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MoveRight,
  Package,
  Play,
  Plus,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  analyzeProducts,
  SAMPLE_CONTENT_PRODUCTS,
  type MigrationReport,
} from "./lib/merchant";
import {
  assessIntegration,
  createBrief,
  type IntegrationAnswers,
  type Assessment,
} from "./lib/assessment";

type SiteConfig = {
  brand?: string;
  contactEmail?: string;
  bookingUrl?: string;
  siteUrl?: string;
  contactIssueUrl?: string;
};
const SUNSET_SOURCE =
  "https://developers.google.com/shopping-content/guides/deprecation-and-sunset";

function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Brand({ light = false }: { light?: boolean }) {
  return (
    <a
      className={`brand ${light ? "brand-light" : ""}`}
      href="#"
      aria-label="Merchant Bridge home"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path
            d="M5 23V10h5l6 7 6-7h5v13h-5v-6l-6 7-6-7v6z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span>
        merchant<span className="brand-word">bridge</span>
        <span className="brand-dot">.</span>
      </span>
    </a>
  );
}

function CodePreview({ view }: { view: "before" | "after" }) {
  return (
    <div
      className="code-preview"
      aria-label={
        view === "before"
          ? "Sample Content API product"
          : "Illustrative Merchant API product fragment"
      }
    >
      <div>
        <span className="line-no">01</span>
        <span className="code-muted">{"{"}</span>
      </div>
      <div>
        <span className="line-no">02</span>
        <span>
          {" "}
          <span className="code-key">"offerId"</span>:{" "}
          <span className="code-string">"LAMP-001"</span>,
        </span>
      </div>
      <div>
        <span className="line-no">03</span>
        <span>
          {" "}
          <span className="code-key">"contentLanguage"</span>:{" "}
          <span className="code-string">"en"</span>,
        </span>
      </div>
      <div>
        <span className="line-no">04</span>
        <span>
          {" "}
          <span className="code-key">"feedLabel"</span>:{" "}
          <span className="code-string">"US"</span>,
        </span>
      </div>
      {view === "before" ? (
        <>
          <div>
            <span className="line-no">05</span>
            <span>
              {" "}
              <span className="code-key">"price"</span>: {"{"}
            </span>
          </div>
          <div className="code-highlight">
            <span className="line-no">06</span>
            <span>
              {" "}
              <span className="code-key">"value"</span>:{" "}
              <span className="code-string">"49.90"</span>,
            </span>
          </div>
          <div>
            <span className="line-no">07</span>
            <span>
              {" "}
              <span className="code-key">"currency"</span>:{" "}
              <span className="code-string">"USD"</span>
            </span>
          </div>
          <div>
            <span className="line-no">08</span>
            <span> {"}"}</span>
          </div>
        </>
      ) : (
        <>
          <div>
            <span className="line-no">05</span>
            <span>
              {" "}
              <span className="code-key">"productAttributes"</span>: {"{"}
            </span>
          </div>
          <div>
            <span className="line-no">06</span>
            <span>
              {" "}
              <span className="code-key">"price"</span>: {"{"}
            </span>
          </div>
          <div className="code-highlight">
            <span className="line-no">07</span>
            <span>
              {" "}
              <span className="code-key">"amountMicros"</span>:{" "}
              <span className="code-string">"49900000"</span>,
            </span>
          </div>
          <div>
            <span className="line-no">08</span>
            <span>
              {" "}
              <span className="code-key">"currencyCode"</span>:{" "}
              <span className="code-string">"USD"</span>
            </span>
          </div>
          <div>
            <span className="line-no">09</span>
            <span> {"}"}</span>
          </div>
          <div>
            <span className="line-no">10</span>
            <span> {"}"}</span>
          </div>
        </>
      )}
      <div>
        <span className="line-no">{view === "before" ? "09" : "11"}</span>
        <span className="code-muted">{"}"}</span>
      </div>
    </div>
  );
}

function FitDialog({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: SiteConfig;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [answers, setAnswers] = useState<IntegrationAnswers>({
    setup: "custom",
    contentApi: "yes",
    products: 500,
    sources: "one",
    markets: "one",
    projectReady: "no",
  });
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (open) {
      setAssessment(null);
      setNotice("");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);
  const change = <K extends keyof IntegrationAnswers>(
    key: K,
    value: IntegrationAnswers[K],
  ) => setAnswers((previous) => ({ ...previous, [key]: value }));
  const brief = assessment ? createBrief(answers, assessment) : "";
  const email =
    config.contactEmail &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)
      ? config.contactEmail
      : "";
  const booking = config.bookingUrl?.startsWith("https://")
    ? config.bookingUrl
    : "";
  const issueUrl = config.contactIssueUrl?.startsWith("https://github.com/")
    ? config.contactIssueUrl
    : "";
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setAssessment(assessIntegration(answers));
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Please check your answers.",
      );
    }
  }
  return (
    <dialog
      ref={dialog}
      className="fit-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      aria-labelledby="fit-title"
    >
      <div className="dialog-content">
        <button
          className="icon-button dialog-close"
          aria-label="Close integration check"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="eyebrow">
          <ScanLine size={14} /> INTEGRATION CHECK
        </span>
        <h2 id="fit-title">
          {assessment ? assessment.title : "Is this the right sprint?"}
        </h2>
        {!assessment ? (
          <>
            <p className="muted">
              Six quick details to establish scope. Your answers stay in this
              browser.
            </p>
            <form onSubmit={submit} className="fit-form">
              <label>
                Who manages your Google connection?
                <select
                  value={answers.setup}
                  onChange={(e) =>
                    change(
                      "setup",
                      e.target.value as IntegrationAnswers["setup"],
                    )
                  }
                >
                  <option value="custom">
                    Our team or agency — custom connector
                  </option>
                  <option value="platform">A platform or feed provider</option>
                  <option value="unsure">I'm not sure</option>
                </select>
              </label>
              <label>
                Does the connector use Content API for Shopping?
                <select
                  value={answers.contentApi}
                  onChange={(e) =>
                    change(
                      "contentApi",
                      e.target.value as IntegrationAnswers["contentApi"],
                    )
                  }
                >
                  <option value="yes">Yes</option>
                  <option value="no">No / already on Merchant API</option>
                  <option value="unsure">I'm not sure</option>
                </select>
              </label>
              <div className="form-row">
                <label>
                  Existing product SKUs
                  <input
                    type="number"
                    min="1"
                    max="100000000"
                    step="1"
                    required
                    value={
                      Number.isNaN(answers.products) ? "" : answers.products
                    }
                    onChange={(e) =>
                      change(
                        "products",
                        e.target.value === "" ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  Custom data sources
                  <select
                    value={answers.sources}
                    onChange={(e) =>
                      change(
                        "sources",
                        e.target.value as IntegrationAnswers["sources"],
                      )
                    }
                  >
                    <option value="one">One source</option>
                    <option value="multiple">Multiple sources</option>
                  </select>
                </label>
              </div>
              <label>
                Markets and language flows
                <select
                  value={answers.markets}
                  onChange={(e) =>
                    change(
                      "markets",
                      e.target.value as IntegrationAnswers["markets"],
                    )
                  }
                >
                  <option value="one">One market / language flow</option>
                  <option value="multiple">
                    Multiple markets or languages
                  </option>
                </select>
              </label>
              <label>
                Existing Cloud project and Merchant admin ready?
                <select
                  value={answers.projectReady}
                  onChange={(e) =>
                    change(
                      "projectReady",
                      e.target.value as IntegrationAnswers["projectReady"],
                    )
                  }
                >
                  <option value="no">Not yet</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
              <button className="button button-green" type="submit">
                Review my scope <ArrowRight size={17} />
              </button>
            </form>
          </>
        ) : (
          <div className="fit-result">
            <p className="muted">{assessment.description}</p>
            <ul className="result-next-steps">
              {assessment.nextSteps.map((step) => (
                <li key={step}>
                  <Check size={16} />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
            {assessment.kind === "candidate" && (
              <div className="brief-price">
                <span>Proposed package, subject to review</span>
                <strong>
                  $1,250 <small>USD</small>
                </strong>
              </div>
            )}
            <div className="fit-actions">
              <button
                className="button button-green"
                onClick={() =>
                  downloadText(
                    "merchant-bridge-brief.md",
                    brief,
                    "text/markdown",
                  )
                }
              >
                Download my brief <ArrowDownToLine size={17} />
              </button>
              {email && (
                <a
                  className="button button-outline"
                  href={`mailto:${email}?subject=${encodeURIComponent("Merchant API migration brief")}&body=${encodeURIComponent(brief)}`}
                >
                  Email my brief <ArrowUpRight size={16} />
                </a>
              )}
              {!email && booking && (
                <a
                  className="button button-outline"
                  href={booking}
                  target="_blank"
                  rel="noreferrer"
                >
                  Discuss the scope <ArrowUpRight size={16} />
                </a>
              )}
              {assessment.kind !== "platform" &&
                !email &&
                !booking &&
                issueUrl && (
                  <a
                    className="button button-outline"
                    href={issueUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Start a public GitHub inquiry <ArrowUpRight size={16} />
                  </a>
                )}
              {assessment.kind !== "platform" &&
                issueUrl &&
                !email &&
                !booking && (
                  <p className="small muted">
                    A GitHub account is required. The inquiry is public. Share
                    only a general project description; keep credentials and
                    client data private.
                  </p>
                )}
              <button
                className="text-button"
                onClick={() => setAssessment(null)}
              >
                Edit my answers
              </button>
            </div>
            <p className="privacy-note">
              <LockKeyhole size={13} /> No answers have been sent. Downloading
              creates a file on your device.
            </p>
          </div>
        )}
        {notice && (
          <p role="alert" className="error-message">
            {notice}
          </p>
        )}
      </div>
    </dialog>
  );
}

function ProductDemo() {
  const [input, setInput] = useState(() =>
    JSON.stringify(SAMPLE_CONTENT_PRODUCTS, null, 2),
  );
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  function run() {
    setError("");
    setCopyNotice("");
    try {
      if (input.length > 200_000)
        throw new Error("Please use a redacted sample smaller than 200 KB.");
      const parsed = JSON.parse(input);
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.resources)
          ? parsed.resources
          : [parsed];
      if (records.length > 100)
        throw new Error(
          "This browser preview supports up to 100 products at a time.",
        );
      setReport(analyzeProducts(parsed));
    } catch (cause) {
      setReport(null);
      setError(
        cause instanceof SyntaxError
          ? "This is not valid JSON. Check the brackets, quotation marks, and trailing commas."
          : cause instanceof Error
            ? cause.message
            : "Unable to read this sample.",
      );
    }
  }
  async function readFile(upload?: File) {
    if (!upload) return;
    if (upload.size > 200_000) {
      setError("Please select a JSON sample smaller than 200 KB.");
      return;
    }
    try {
      setInput(await upload.text());
      setReport(null);
      setError("");
    } catch {
      setError(
        "The file could not be read. Please paste its JSON content instead.",
      );
    }
    if (file.current) file.current.value = "";
  }
  const serialized = report
    ? JSON.stringify(
        {
          mode: "local-preview",
          api: "products/v1",
          googleValidated: false,
          ...report,
        },
        null,
        2,
      )
    : "";
  return (
    <section id="demo" className="section demo-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Braces size={15} /> LOOK UNDER THE HOOD
          </span>
          <h2>
            See what changes.
            <br />
            <span className="muted-heading">Before anything goes live.</span>
          </h2>
        </div>
        <p>
          Inspect a small product sample. See the mapped fields, catch data
          issues, and export the review.
        </p>
      </div>
      <div className="demo-workspace">
        <div className="workspace-bar">
          <span>
            <span className="live-dot" /> LOCAL PRODUCT CHECKER
          </span>
          <span className="local-label">
            <LockKeyhole size={12} /> Runs in your browser
          </span>
        </div>
        <div className="demo-grid">
          <div className="editor-pane">
            <div className="pane-title">
              <span>
                <FileJson size={16} /> Content API input
              </span>
              <button
                className="text-button"
                onClick={() => {
                  setInput(JSON.stringify(SAMPLE_CONTENT_PRODUCTS, null, 2));
                  setReport(null);
                  setError("");
                }}
              >
                Reset sample
              </button>
            </div>
            <label className="sr-only" htmlFor="product-json">
              Content API product JSON
            </label>
            <textarea
              id="product-json"
              value={input}
              spellCheck={false}
              maxLength={200001}
              onChange={(e) => {
                setInput(e.target.value);
                setReport(null);
                setError("");
              }}
            />
            <div className="editor-footer">
              <button
                className="button button-green button-small"
                onClick={run}
              >
                <Play size={14} fill="currentColor" /> Run sample check
              </button>
              <button
                className="text-button"
                onClick={() => file.current?.click()}
              >
                <Plus size={14} /> Load JSON
              </button>
              <input
                ref={file}
                className="sr-only"
                type="file"
                accept=".json,application/json"
                onChange={(e) => void readFile(e.target.files?.[0])}
                aria-label="Load product JSON file"
              />
            </div>
          </div>
          <div className="results-pane" aria-live="polite">
            <div className="pane-title">
              <span>
                <ScanLine size={16} /> Mapping review
              </span>
              {report && (
                <button
                  className="text-button"
                  onClick={() =>
                    downloadText(
                      "merchant-bridge-product-review.json",
                      serialized,
                      "application/json",
                    )
                  }
                  aria-label="Export product review"
                >
                  <ArrowDownToLine size={14} /> Export
                </button>
              )}
            </div>
            {error ? (
              <div className="demo-error" role="alert">
                <CircleHelp size={28} />
                <h3>Let's check the input.</h3>
                <p>{error}</p>
              </div>
            ) : report ? (
              <>
                <div className="review-summary">
                  <div>
                    <strong>{report.summary.ready}</strong>
                    <span>Mapped</span>
                  </div>
                  <div>
                    <strong>{report.summary.review}</strong>
                    <span>To review</span>
                  </div>
                  <div>
                    <strong>{report.summary.blocked}</strong>
                    <span>Blocked</span>
                  </div>
                </div>
                <div className="product-results">
                  {report.results.map((product) => (
                    <details
                      className="product-result"
                      key={`${product.sourceIndex}-${product.offerId}`}
                    >
                      <summary>
                        <span
                          className={`result-symbol status-${product.status}`}
                        >
                          {product.status === "ready" ? (
                            <Check size={15} />
                          ) : (
                            <CircleHelp size={15} />
                          )}
                        </span>
                        <span className="product-id">
                          {product.offerId ||
                            `Product ${product.sourceIndex + 1}`}
                        </span>
                        <span
                          className={`status-pill status-${product.status}`}
                        >
                          {product.status === "ready"
                            ? "Mapped"
                            : product.status === "review"
                              ? "Review"
                              : "Blocked"}
                        </span>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="product-detail">
                        {product.issues.map((issue, index) => (
                          <p className={`issue-${issue.level}`} key={index}>
                            <strong>{issue.field}</strong> {issue.message}
                          </p>
                        ))}
                        {product.payload && (
                          <pre>{JSON.stringify(product.payload, null, 2)}</pre>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
                <p className="review-footnote">
                  Local mapping checks only. These products have not been sent
                  to or approved by Google.
                </p>
              </>
            ) : (
              <div className="empty-review">
                <div className="empty-icon">
                  <ScanLine size={31} strokeWidth={1.4} />
                </div>
                <h3>Your migration, in focus.</h3>
                <p>
                  Run the sample to inspect product mapping
                  <br />
                  and the fields that need attention.
                </p>
                <span className="sample-label">
                  3 synthetic products · 1 deliberate data issue
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="workspace-note">
          <ShieldCheck size={15} />
          <span>
            Sample data only. Use redacted JSON. No credentials, uploads to a
            server, or account changes.
          </span>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  [
    "Is my store affected?",
    <>
      This service is for custom connectors that still call Content API for
      Shopping. If Shopify, another ecommerce platform, or a feed provider
      manages your connection, ask that provider about its migration. A separate
      custom connector may still need attention.
    </>,
  ],
  [
    "What does the fixed price cover?",
    <>
      One existing Merchant account, one custom data source, one market/language
      flow, and up to 5,000 existing SKUs. The connector review must confirm
      8–12 hours of engineering and testing. The sprint includes mapping,
      request flow updates, failure handling, and a technical handover.
    </>,
  ],
  [
    "When does the two-day delivery target start?",
    <>
      After the scope is agreed and the existing Cloud project, Merchant
      administrator, code, and sample data are ready. Larger changes, missing
      permissions, and third-party reviews require a separate schedule.
    </>,
  ],
  [
    "Will this fix disapproved products or a suspended account?",
    <>
      Migration fixes the technical connection. Google product approval, policy
      appeals, advertising results, and account reinstatement are separate
      processes and are not included or guaranteed.
    </>,
  ],
  [
    "Does the checker connect to Google?",
    <>
      No. The checker maps a limited set of Content API product fields locally
      in your browser. Unsupported fields are surfaced for review. A live
      migration still requires authenticated API testing in the customer's
      existing project.
    </>,
  ],
  [
    "Can you work under our agency brand?",
    <>
      The package can be scoped as a delivery task for an agency's existing
      client integration. Your team keeps the client relationship; the agreed
      handover contains the mapping notes, test evidence, and operating
      instructions.
    </>,
  ],
];

export default function App() {
  const [fitOpen, setFitOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"before" | "after">("after");
  const [config, setConfig] = useState<SiteConfig>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}site-config.json`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setConfig)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const openFit = () => {
    setFitOpen(true);
    setMenuOpen(false);
  };
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container nav-wrap">
          <Brand />
          <nav
            aria-label="Main navigation"
            className={menuOpen ? "navigation navigation-open" : "navigation"}
          >
            <a href="#process" onClick={() => setMenuOpen(false)}>
              The approach
            </a>
            <a href="#demo" onClick={() => setMenuOpen(false)}>
              Try the checker <span className="nav-tag">LOCAL</span>
            </a>
            <a href="#sprint" onClick={() => setMenuOpen(false)}>
              The sprint
            </a>
          </nav>
          <button className="button button-green nav-cta" onClick={openFit}>
            Check your integration <ArrowUpRight size={16} />
          </button>
          <button
            className="icon-button mobile-menu"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span className="live-dot" /> BUILT FOR CUSTOM ECOMMERCE
              INTEGRATIONS
            </span>
            <h1>
              A clear path to
              <br />
              <span>Merchant API.</span>
            </h1>
            <p className="hero-description">
              Move your custom Google Shopping connector forward. A focused
              migration, checked product data, and a handover your team can use.
            </p>
            <div className="hero-actions">
              <button
                className="button button-green button-large"
                onClick={openFit}
              >
                Check your integration <ArrowUpRight size={19} />
              </button>
              <a className="button button-quiet" href="#demo">
                <Play size={15} /> Explore the demo
              </a>
            </div>
            <div className="hero-footnote">
              <span>
                <Check size={14} /> Fixed scope
              </span>
              <span>
                <Check size={14} /> Your existing Cloud project
              </span>
              <span>
                <Check size={14} /> Clear handover
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="migration-card">
              <div className="migration-top">
                <span className="migration-icon">
                  <GitBranch size={18} />
                </span>
                <div>
                  <strong>One connector. A considered move.</strong>
                  <span>Illustrative product mapping</span>
                </div>
                <span className="sample-badge">SAMPLE</span>
              </div>
              <div className="api-route">
                <div>
                  <span className="api-square api-old">
                    <Braces size={19} />
                  </span>
                  <span>
                    Content API<small>v2.1</small>
                  </span>
                </div>
                <div className="route-line">
                  <MoveRight size={28} />
                </div>
                <div>
                  <span className="api-square api-new">
                    <Layers3 size={19} />
                  </span>
                  <span>
                    Merchant API<small>v1</small>
                  </span>
                </div>
              </div>
              <div
                className="code-tabs"
                role="tablist"
                aria-label="Illustrative API fragments"
              >
                <button
                  role="tab"
                  aria-selected={view === "before"}
                  onClick={() => setView("before")}
                >
                  Before <span>Content API</span>
                </button>
                <button
                  role="tab"
                  aria-selected={view === "after"}
                  onClick={() => setView("after")}
                >
                  After <span>Merchant API</span>
                </button>
                <span className="json-tag">JSON</span>
              </div>
              <CodePreview view={view} />
              <div className="mapping-note">
                <span className="mapping-check">
                  <CheckCheck size={15} />
                </span>
                <span>
                  Exact price mapping{" "}
                  <strong>$49.90 → 49,900,000 micros</strong>
                </span>
              </div>
            </div>
            <div className="floating-note">
              <span className="floating-icon">
                <LockKeyhole size={17} />
              </span>
              <div>
                <strong>Your infrastructure stays yours.</strong>
                <span>Built around your existing project.</span>
              </div>
            </div>
          </div>
        </section>
        <div className="context-strip">
          <div className="container context-inner">
            <span className="context-icon">
              <GitBranch size={18} />
            </span>
            <p>
              <strong>The API transition is underway.</strong> Legacy Content
              API requests may return intermittent HTTP 410 errors without an
              active extension.
            </p>
            <a href={SUNSET_SOURCE} target="_blank" rel="noreferrer">
              Read Google's notice <ArrowUpRight size={15} />
            </a>
          </div>
        </div>
        <div className="container">
          <section id="process" className="section process-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  A SMALL SPRINT. A COMPLETE HANDOVER.
                </span>
                <h2>
                  From legacy calls
                  <br />
                  to a connection you understand.
                </h2>
              </div>
              <p>
                Start with the connector you have.
                <br />
                Make the changes visible at every step.
              </p>
            </div>
            <div className="process-grid">
              <article className="process-card">
                <span className="step-no">01 / UNDERSTAND</span>
                <span className="step-icon">
                  <ScanLine size={25} strokeWidth={1.5} />
                </span>
                <h3>Scope the connection.</h3>
                <p>
                  Review the existing API calls, product sample, and account
                  setup. Agree the exact work before the sprint begins.
                </p>
                <span className="step-output">
                  <FileJson size={13} /> A defined migration brief
                </span>
              </article>
              <article className="process-card">
                <span className="step-no">02 / MOVE</span>
                <span className="step-icon">
                  <GitBranch size={25} strokeWidth={1.5} />
                </span>
                <h3>Map. Migrate. Check.</h3>
                <p>
                  Update the product mapping and request flow. Make retries,
                  invalid records, and rejected requests visible.
                </p>
                <span className="step-output">
                  <Code2 size={13} /> A reviewed connector update
                </span>
              </article>
              <article className="process-card">
                <span className="step-no">03 / HAND OVER</span>
                <span className="step-icon">
                  <CheckCheck size={25} strokeWidth={1.5} />
                </span>
                <h3>Leave a clear trail.</h3>
                <p>
                  Reconcile sample products and two successive syncs. Deliver
                  test evidence and instructions for your team.
                </p>
                <span className="step-output">
                  <Clipboard size={13} /> Evidence and operating notes
                </span>
              </article>
            </div>
          </section>
          <ProductDemo />
          <section id="sprint" className="section sprint-section">
            <div className="sprint-description">
              <span className="eyebrow">THE MIGRATION SPRINT</span>
              <h2>
                A focused scope.
                <br />A fixed price.
              </h2>
              <p>
                For teams and agencies with an existing custom connector. A
                direct engineering engagement, built around a clear finish line.
              </p>
              <a
                href={`${import.meta.env.BASE_URL}merchant-migration-checklist.md`}
                download
                className="resource-link"
              >
                <ArrowDownToLine size={17} />
                <span>
                  Download the readiness checklist
                  <small>A practical starting point for your team</small>
                </span>
                <ArrowUpRight size={17} />
              </a>
              <p className="small scope-note">
                Platform-managed connection? Your provider usually handles the
                migration. The integration check helps you identify the next
                step.
              </p>
            </div>
            <div className="price-card">
              <div className="price-heading">
                <span className="eyebrow">ONE MIGRATION SPRINT</span>
                <span className="fixed-tag">FIXED SCOPE</span>
              </div>
              <div className="price">
                $1,250<span>USD / project</span>
              </div>
              <p className="price-subtitle">
                $625 on scope agreement. $625 after acceptance.
              </p>
              <div className="price-divider" />
              <ul className="price-features">
                {[
                  "One Merchant account + one custom source",
                  "One market / language flow",
                  "Up to 5,000 existing product SKUs",
                  "Product mapping + request flow migration",
                  "Sync checks, failure reporting + handover",
                ].map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="delivery-note">
                <span className="live-dot" />
                <p>
                  <strong>Target: two business days</strong>
                  <br />
                  After agreed scope and required access are ready.
                </p>
              </div>
              <button
                className="button button-green button-full"
                onClick={openFit}
              >
                Check your integration <ArrowRight size={18} />
              </button>
              <p className="price-condition">
                Scope must fit 8–12 hours of engineering and testing. Product
                approvals, policy appeals, and larger scopes are separate.
              </p>
            </div>
          </section>
          <section className="section faq-section" id="questions">
            <div>
              <span className="eyebrow">A FEW USEFUL DETAILS</span>
              <h2>Before we begin.</h2>
              <p className="muted">
                Clear expectations make
                <br />
                for a better migration.
              </p>
            </div>
            <div className="faq-list">
              {FAQS.map(([question, answer], index) => (
                <details key={index}>
                  <summary>
                    {question}
                    <Plus size={19} />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <section className="closing-panel">
            <div>
              <span className="eyebrow">KEEP THE NEXT STEP SIMPLE</span>
              <h2>Start with your connection.</h2>
              <p>A short scope check. A useful brief. A clear next step.</p>
            </div>
            <button
              className="button button-lime button-large"
              onClick={openFit}
            >
              Check your integration <ArrowUpRight size={19} />
            </button>
          </section>
        </div>
      </main>
      <footer className="container site-footer">
        <div className="footer-top">
          <Brand />
          <span>Independent engineering for custom commerce connections.</span>
          <a href={SUNSET_SOURCE} target="_blank" rel="noreferrer">
            Official migration guidance <ArrowUpRight size={13} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Merchant Bridge</span>
          <span>
            Independent service. Not affiliated with or endorsed by Google.
          </span>
          <span>No tracking cookies.</span>
        </div>
      </footer>
      <FitDialog
        open={fitOpen}
        onClose={() => setFitOpen(false)}
        config={config}
      />
    </>
  );
}
