export default function App() {
  return (
    <>
      {/* ===================== NAV ===================== */}
      <nav className="nav">
        <div className="wrap">
          <div className="logo">
            <span className="mark">T</span> Moonga
          </div>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a href="#product">Product</a>
            <a href="#output">The plan</a>
            <a href="#why">Why Moonga</a>
          </div>
          <div className="nav-cta">
            <a className="btn" href="#">
              ★ GitHub
            </a>
            <a className="btn primary" href="#cta">
              Get started
            </a>
          </div>
        </div>
      </nav>

      {/* ===================== HERO ===================== */}
      <header className="header">
        <div className="glow" />
        <div className="grid-bg" />
        <div className="wrap">
          <div className="hero">
            <span className="badge">
              <span className="tagp">Open source</span> Self-host in minutes · MIT
            </span>
            <h1 className="h1">
              Turn Linear tickets into <span className="grad">reviewable plans</span> — before
              anyone writes code.
            </h1>
            <p className="lede">
              Moonga reads a new Linear issue, pulls real context from your GitHub repo, drafts a
              structured implementation plan, and posts it to Slack for approval — then writes it
              back to Linear.
            </p>
            <div className="cta">
              <a className="btn primary lg" href="#cta">
                Get started free
              </a>
              <a className="btn lg" href="#how">
                See how it works →
              </a>
            </div>
            <div className="trust">
              <span>
                <span className="dotg" /> Human-in-the-loop
              </span>
              <span>
                <span className="dotg" /> Bring your own model
              </span>
              <span>
                <span className="dotg" /> No auto-deploys, ever
              </span>
            </div>
          </div>

          <div className="shot">
            <div className="browser">
              <div className="chrome">
                <div className="dots">
                  <i className="r" />
                  <i className="y" />
                  <i className="g" />
                </div>
                <div className="url">
                  <b>app.moonga.dev</b> / artifacts / EVE-5
                </div>
              </div>
              <img
                src="/plan.png"
                alt="A generated implementation plan with the agent trace alongside it"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ===================== LOGO STRIP ===================== */}
      <div className="strip">
        <div className="wrap">
          <div className="lbl">Works with the stack you already run</div>
          <div className="row">
            <span className="lg-item">
              <span className="sq lin">L</span> Linear
            </span>
            <span className="lg-item">
              <span className="sq git">G</span> GitHub
            </span>
            <span className="lg-item">
              <span className="sq slk">S</span> Slack
            </span>
            <span className="lg-item">
              <span className="sq or">O</span> OpenRouter
            </span>
            <span className="lg-item">
              <span className="sq oai">A</span> OpenAI
            </span>
          </div>
        </div>
      </div>

      {/* ===================== HOW IT WORKS ===================== */}
      <section id="how" className="section">
        <div className="wrap">
          <div className="eyebrow">How it works</div>
          <h2 className="h2">A deterministic loop, not a black box</h2>
          <p className="sectlede">
            Seven steps from issue to approved plan. You stay in control at the one step that
            matters — approval.
          </p>
          <div className="pipe">
            {[
              { ic: "🎫", k: "01", h: "Trigger", p: "A new Linear issue fires a webhook." },
              { ic: "⚙️", k: "02", h: "Session", p: "An agent session opens to plan." },
              { ic: "📦", k: "03", h: "Context", p: "Reads your repo from GitHub." },
              { ic: "🔍", k: "04", h: "Search", p: "Finds the relevant code." },
              { ic: "📝", k: "05", h: "Draft", p: "Writes a structured plan." },
              { ic: "💬", k: "06", h: "Review", p: "Posts to Slack to approve." },
              { ic: "✓", k: "07", h: "Write back", p: "Updates the Linear issue." },
            ].map((s) => (
              <div className="pstep" key={s.k}>
                <div className="node">{s.ic}</div>
                <div className="k">{s.k}</div>
                <h4>{s.h}</h4>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== PRODUCT SHOWCASE ===================== */}
      <section id="product" className="section bg-soft">
        <div className="wrap">
          <div className="eyebrow">Inside Moonga</div>
          <h2 className="h2">See the whole workflow, not just an answer</h2>
          <p className="sectlede">
            Every session is inspectable — the plan, the trace, the integrations, and the playbook
            that shaped it.
          </p>
          <div className="bento">
            <div className="panel tall">
              <div className="pad">
                <span className="tag">The output</span>
                <h3>Source-grounded plans, with a full trace</h3>
                <p>
                  Each plan is generated from your actual code — and every step the agent took sits
                  right beside it, so you can trust what you approve.
                </p>
              </div>
              <div className="frame">
                <img src="/plan.png" alt="Implementation plan with agent trace" />
              </div>
            </div>
            <div className="panel">
              <div className="pad">
                <span className="tag">Integrations</span>
                <h3>Connect once, in minutes</h3>
                <p>
                  GitHub, Linear and Slack wire up with a few keys. Bring your own model provider.
                </p>
              </div>
              <div className="frame">
                <img src="/integrations.png" alt="Integrations settings" />
              </div>
            </div>
            <div className="panel full">
              <div className="pad">
                <span className="tag">Playbooks</span>
                <h3>You control how it plans</h3>
                <p>
                  Editable, versioned instructions decide how each ticket type is researched and
                  planned — deterministic by design, never a hidden prompt.
                </p>
              </div>
              <div className="frame">
                <img src="/playbooks.png" alt="Playbook instructions editor" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== OUTPUT STRUCTURE ===================== */}
      <section id="output" className="section">
        <div className="wrap">
          <div className="eyebrow">The plan</div>
          <h2 className="h2">Every plan is structured the same way</h2>
          <p className="sectlede">
            Predictable sections mean a junior can pick up the work without a meeting.
          </p>
          <div className="out">
            {[
              { n: "01", h: "Summary", p: "What the ticket is actually asking for." },
              { n: "02", h: "Scope", p: "What's included — and what's explicitly out." },
              { n: "03", h: "Relevant files", p: "The modules and files likely to be touched." },
              { n: "04", h: "Implementation steps", p: "An ordered, executable plan." },
              { n: "05", h: "Risks", p: "Edge cases and unknowns, surfaced early." },
              { n: "06", h: "Handoff notes", p: "What a developer should do next." },
            ].map((o) => (
              <div className="ocard" key={o.n}>
                <div className="num">{o.n}</div>
                <h4>{o.h}</h4>
                <p>{o.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== WHY ===================== */}
      <section id="why" className="section bg-soft">
        <div className="wrap">
          <div className="eyebrow">Why Moonga</div>
          <h2 className="h2">A context-driven planning layer — not another AI chatbot</h2>
          <p className="sectlede">
            The wedge is context aggregation plus structured planning. Most tools have only one.
          </p>
          <div className="why">
            <div className="wcard">
              <div className="ic">🧩</div>
              <h4>Linear-native AI lacks repo context</h4>
              <p>It can summarize a ticket, but it doesn't know your codebase. Moonga reads GitHub directly.</p>
            </div>
            <div className="wcard">
              <div className="ic">💬</div>
              <h4>Chat agents are disconnected</h4>
              <p>Generic assistants float outside your workflow. Moonga lives inside Linear → GitHub → Slack.</p>
            </div>
            <div className="wcard">
              <div className="ic">⚡</div>
              <h4>Coding agents skip the plan</h4>
              <p>Execution agents jump to changing code. Moonga stops at the plan — where the leverage is.</p>
            </div>
            <div className="wcard">
              <div className="ic">🔌</div>
              <h4>Model-agnostic by design</h4>
              <p>Bring your own key, swap models per task, route through OpenRouter. The model is a component.</p>
            </div>
          </div>
          <div className="ribbon">
            <span className="rchip">Deterministic workflow</span>
            <span className="rchip">Human-in-the-loop</span>
            <span className="rchip">Planning, not execution</span>
            <span className="rchip">BYOK</span>
            <span className="rchip">Runs as a personal tool</span>
          </div>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section id="cta" className="section cta-band">
        <div className="wrap">
          <div className="inner">
            <h2 className="h2">Reduce the cost of interpretation before implementation.</h2>
            <p>
              Self-host Moonga today. It's open source, runs as a personal tool, and never touches
              your code without you.
            </p>
            <div className="cta">
              <a className="btn white lg" href="#">
                ★ Star on GitHub
              </a>
              <a className="btn ghost-white lg" href="#">
                Read the docs
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="footer">
        <div className="wrap">
          <div className="logo">
            <span className="mark">T</span> Moonga
          </div>
          <div className="links">
            <a href="#">GitHub</a>
            <a href="#">Docs</a>
            <a href="#">Demo</a>
            <a href="#">MIT License</a>
          </div>
        </div>
      </footer>
    </>
  );
}
