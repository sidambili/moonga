import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Star } from "lucide-react";

/* ── Theme ───────────────────────────────────────────────────────────────── */
function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("moonga-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("moonga-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}

/* ── Scroll-reveal ───────────────────────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1, rootMargin: "0px 0px -48px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Data ────────────────────────────────────────────────────────────────── */
const GITHUB_URL = "https://github.com/sidambili/moonga";

const WHY_CARDS = [
  {
    num: "01",
    title: "Linear-native AI lacks repo context",
    body: "It can summarize a ticket, but it doesn't know your codebase. Moonga reads GitHub directly.",
  },
  {
    num: "02",
    title: "Chat agents are disconnected",
    body: "Generic assistants float outside your workflow. Moonga lives inside Linear, GitHub, and Slack.",
  },
  {
    num: "03",
    title: "Coding agents skip the plan",
    body: "Execution agents jump to changing code. Moonga stops at the plan, where the leverage is.",
  },
  {
    num: "04",
    title: "Model-agnostic by design",
    body: "Bring your own key, swap models per task, route through OpenRouter. The model is a component.",
  },
];

const STEPS = [
  { n: "01", h: "Trigger",    p: "A new Linear issue fires a webhook." },
  { n: "02", h: "Session",    p: "An agent session opens to plan." },
  { n: "03", h: "Context",    p: "Reads your repo from GitHub." },
  { n: "04", h: "Search",     p: "Finds the relevant code." },
  { n: "05", h: "Draft",      p: "Writes a structured plan." },
  { n: "06", h: "Review",     p: "Posts to Slack for approval." },
  { n: "07", h: "Write back", p: "Updates the Linear issue." },
];

const PLAN_SECTIONS = [
  { n: "01", h: "Summary",              p: "What the ticket is actually asking for." },
  { n: "02", h: "Scope",                p: "What's in, and what's explicitly out." },
  { n: "03", h: "Relevant files",       p: "The modules and files likely to be touched." },
  { n: "04", h: "Implementation steps", p: "An ordered, executable plan." },
  { n: "05", h: "Risks",                p: "Edge cases and unknowns, surfaced early." },
  { n: "06", h: "Handoff notes",        p: "What a developer should do next." },
];

const INTEGRATIONS = [
  { name: "Linear",     slug: "linear" },
  { name: "GitHub",     slug: "github" },
  { name: "Slack",      slug: "slack" },
  { name: "OpenRouter", slug: "openrouter" },
  { name: "OpenAI",     slug: "openai" },
];

const PRINCIPLES = [
  "Deterministic workflow",
  "Human-in-the-loop",
  "Planning, not execution",
  "BYOK",
  "Self-hostable",
];

/* ── Component ───────────────────────────────────────────────────────────── */
export default function App() {
  useReveal();
  const { theme, toggle } = useTheme();

  return (
    <>
      {/* ── NAV — rigid structural bar ── */}
      <nav className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">
            <span className="logo-mark">M</span>
            Moonga
          </a>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a href="#product">Product</a>
            <a href="#output">The plan</a>
            <a href="#why">Why Moonga</a>
          </div>
          <div className="nav-cta">
            <button
              type="button"
              className="btn ghost theme-toggle"
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? "[ DARK ]" : "[ LIGHT ]"}
            </button>
            <a className="btn ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Star size={13} strokeWidth={1.5} />
              GitHub
            </a>
            <a className="btn primary" href="#cta">
              Get started
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="header">
        <div className="wrap">
          <div className="hero">
            <div className="hero-meta">
              <div className="hero-meta-inner">
                <span className="hero-status" />
                Open source / MIT / Self-host in minutes
              </div>
            </div>

            <h1 className="hero-h1">
              Turn Linear tickets into{" "}
              <span className="accent">reviewable plans</span>{" "}
              before anyone writes code.
            </h1>

            <p className="hero-lede">
              Moonga reads a new Linear issue, pulls real context from your GitHub repo,
              drafts a structured implementation plan, and posts it to Slack for approval.
            </p>

            <div className="hero-cta-wrap">
              <a className="btn primary lg" href="#cta">
                Get started free
                <span className="btn-icon">
                  <ArrowUpRight size={14} strokeWidth={1.5} />
                </span>
              </a>
              <a className="btn ghost lg" href="#how">
                See how it works
              </a>
            </div>

            <div className="trust-row hero-trust">
              {["Human-in-the-loop", "Bring your own model", "No auto-deploys, ever"].map((t) => (
                <span key={t} className="trust-item">
                  <Check size={12} strokeWidth={1.5} className="trust-icon" aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Terminal frame — not a browser mockup */}
          <div className="hero-shot">
            <div className="hero-shot-chrome">
              <span>app.moonga.dev / artifacts / EVE-5</span>
            </div>
            <img
              src="/plan.png"
              alt="A generated implementation plan with agent trace"
            />
          </div>
        </div>
      </header>

      {/* ── LOGO STRIP ── */}
      <div className="logo-strip">
        <div className="wrap">
          <p className="strip-label">[ Integrations ]</p>
          <div className="strip-logos">
            {INTEGRATIONS.map((i, idx) => (
              <span
                key={i.slug}
                className="strip-item reveal"
                style={{ "--stagger": `${idx * 50}ms` } as React.CSSProperties}
              >
                <img
                  src={`https://cdn.simpleicons.org/${i.slug}/ffffff`}
                  width={14}
                  height={14}
                  alt={i.name}
                  className="strip-icon"
                />
                {i.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="section section-alt">
        <div className="wrap">
          <div className="section-header reveal">
            <p className="sect-label">How it works</p>
            <h2 className="h2">A deterministic loop, not a black box</h2>
            <p className="sect-lede">
              Seven steps from issue to approved plan. You control the one step that matters.
            </p>
          </div>
          <div className="pipeline">
            {STEPS.map((s, idx) => (
              <div
                className="step reveal"
                key={s.n}
                style={{ "--stagger": `${idx * 45}ms` } as React.CSSProperties}
              >
                <div className="step-node">{s.n}</div>
                <h4 className="step-title">{s.h}</h4>
                <p className="step-body">{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT SHOWCASE ── */}
      <section id="product" className="section">
        <div className="wrap">
          <div className="section-header reveal">
            <p className="sect-label">Product</p>
            <h2 className="h2">See the whole workflow, not just an answer</h2>
            <p className="sect-lede">
              Every session is inspectable: the plan, the trace, the integrations, and the
              playbook that shaped it.
            </p>
          </div>
          <div className="bento">
            {/* Tall panel — left, spans 2 rows */}
            <div
              className="panel-shell panel-shell-tall reveal"
              style={{ "--stagger": "0ms" } as React.CSSProperties}
            >
              <div className="panel">
                <div>
                  <span className="panel-tag">[ Output ]</span>
                  <h3 className="panel-title">Source-grounded plans, with a full trace</h3>
                  <p className="panel-text">
                    Each plan is generated from your actual code. Every step the agent took
                    sits right beside it, so you can trust what you approve.
                  </p>
                </div>
                <div className="panel-frame">
                  <img src="/critic-review.png" alt="Critic review interface" />
                </div>
              </div>
            </div>

            {/* Right stack */}
            <div
              className="panel-shell reveal"
              style={{ "--stagger": "70ms" } as React.CSSProperties}
            >
              <div className="panel">
                <div>
                  <span className="panel-tag">[ Integrations ]</span>
                  <h3 className="panel-title">Connect once, in minutes</h3>
                  <p className="panel-text">
                    GitHub, Linear, and Slack wire up with a few keys. Bring your own
                    model provider.
                  </p>
                </div>
                <div className="panel-frame">
                  <img src="/integrations.png" alt="Integrations settings" />
                </div>
              </div>
            </div>

            <div
              className="panel-shell reveal"
              style={{ "--stagger": "130ms" } as React.CSSProperties}
            >
              <div className="panel">
                <div>
                  <span className="panel-tag">[ Playbooks ]</span>
                  <h3 className="panel-title">You control how it plans</h3>
                  <p className="panel-text">
                    Editable, versioned instructions decide how each ticket type is
                    researched and planned. Deterministic by design.
                  </p>
                </div>
                <div className="panel-frame">
                  <img src="/playbooks.png" alt="Playbook instructions editor" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLAN STRUCTURE ── */}
      <section id="output" className="section section-alt">
        <div className="wrap">
          <div className="section-header reveal">
            <p className="sect-label">The plan</p>
            <h2 className="h2">Every plan is structured the same way</h2>
            <p className="sect-lede">
              Predictable sections mean a junior developer can pick up the work without a
              meeting.
            </p>
          </div>
          <div className="plan-grid">
            {PLAN_SECTIONS.map((o, idx) => (
              <div
                className="plan-card reveal"
                key={o.n}
                style={{ "--stagger": `${idx * 45}ms` } as React.CSSProperties}
              >
                <span className="plan-num">{o.n}</span>
                <h4 className="plan-title">{o.h}</h4>
                <p className="plan-body">{o.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY MOONGA ── */}
      <section id="why" className="section">
        <div className="wrap">
          <div className="section-header reveal">
            <p className="sect-label">Why Moonga</p>
            <h2 className="h2">A context-driven planning layer, not another AI chatbot</h2>
            <p className="sect-lede">
              The wedge is context aggregation plus structured planning. Most tools have
              only one.
            </p>
          </div>
          <div className="why-grid">
            {WHY_CARDS.map(({ num, title, body }, idx) => (
              <div
                className="why-card reveal"
                key={title}
                style={{ "--stagger": `${idx * 55}ms` } as React.CSSProperties}
              >
                <div className="why-num">UNIT / {num}</div>
                <h4 className="why-title">{title}</h4>
                <p className="why-body">{body}</p>
              </div>
            ))}
          </div>
          <div
            className="principles reveal"
            style={{ "--stagger": "180ms" } as React.CSSProperties}
          >
            {PRINCIPLES.map((p) => (
              <span key={p} className="principle-chip">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="cta" className="section section-alt">
        <div className="wrap">
          <div className="cta-band reveal">
            <h2 className="cta-title">
              Reduce the cost of interpretation before implementation.
            </h2>
            <p className="cta-body">
              Self-host Moonga today. Open source, runs as a personal tool, and never
              touches your code without you.
            </p>
            <div className="cta-btns">
              <a className="btn accent lg" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <Star size={14} strokeWidth={1.5} />
                Star on GitHub
              </a>
              <a className="btn ghost lg" href="#">
                Read the docs
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="wrap footer-inner">
          <a href="/" className="logo">
            <span className="logo-mark">M</span>
            Moonga
          </a>
          <div className="footer-links">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="#">Docs</a>
            <a href="#">Demo</a>
            <a href="#">MIT License</a>
          </div>
        </div>
      </footer>
    </>
  );
}
