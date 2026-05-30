import { Home, Zap, Bot, CheckSquare, Plug, Settings, Bell, ChevronRight } from "lucide-react";

const nav = [
  { label: "Dashboard", icon: Home, active: true },
  { label: "Events", icon: Zap },
  { label: "Sessions", icon: Bot },
  { label: "Review", icon: CheckSquare, badge: 2 },
  { label: "Integrations", icon: Plug },
];

const events = [
  { title: "TypeError: Cannot read properties of null", source: "Sentry", severity: "critical", time: "2m ago", read: false },
  { title: "Add dark mode support to dashboard", source: "Linear", severity: "low", time: "1h ago", read: false },
  { title: "Better Stack: Database latency spike", source: "BetterStack", severity: "high", time: "3h ago", read: true },
  { title: "Push: Fix null check in auth handler", source: "GitHub", severity: "low", time: "5h ago", read: true },
];

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
};

const sourceColor: Record<string, string> = {
  Sentry: "text-purple-400",
  Linear: "text-indigo-400",
  BetterStack: "text-emerald-400",
  GitHub: "text-slate-400",
};

export function Clean() {
  return (
    <div
      className="flex flex-col h-screen w-full overflow-hidden"
      style={{
        background: "#0c0c0e",
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: "#e2e2e5",
      }}
    >
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-5 pt-12 pb-4 flex-shrink-0"
        style={{ background: "#0c0c0e" }}
      >
        <div>
          <p className="text-xs font-medium" style={{ color: "#555560" }}>Sat, May 30</p>
          <h1 className="text-xl font-semibold tracking-tight mt-0.5">Command Center</h1>
        </div>
        <div className="relative">
          <button
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ background: "#18181f" }}
          >
            <Bell className="w-4 h-4" style={{ color: "#888896" }} />
          </button>
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ background: "#ef4444" }}
          />
        </div>
      </header>

      {/* Stat strip */}
      <div className="flex gap-3 px-5 pb-5 flex-shrink-0">
        {[
          { label: "Events", value: "8", color: "#e2e2e5" },
          { label: "Critical", value: "1", color: "#ef4444" },
          { label: "Pending", value: "2", color: "#fb923c" },
          { label: "Sessions", value: "1", color: "#60a5fa" },
        ].map((s) => (
          <div
            key={s.label}
            className="flex-1 rounded-xl px-3 py-3"
            style={{ background: "#141418", border: "1px solid #1e1e26" }}
          >
            <p className="text-[10px] font-medium mb-1.5" style={{ color: "#555560" }}>
              {s.label}
            </p>
            <p className="text-xl font-semibold" style={{ color: s.color }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between px-5 mb-3 flex-shrink-0">
        <p className="text-sm font-medium" style={{ color: "#888896" }}>Recent Events</p>
        <button className="flex items-center gap-0.5 text-xs font-medium" style={{ color: "#6366f1" }}>
          See all <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-4">
        {events.map((e, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-xl px-4 py-3.5"
            style={{
              background: e.read ? "transparent" : "#141418",
              border: `1px solid ${e.read ? "#1a1a22" : "#1e1e28"}`,
            }}
          >
            <span
              className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${severityDot[e.severity]}`}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium leading-snug truncate"
                style={{ color: e.read ? "#888896" : "#e2e2e5" }}
              >
                {e.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-medium ${sourceColor[e.source]}`}>
                  {e.source}
                </span>
                <span className="text-xs" style={{ color: "#3d3d4a" }}>·</span>
                <span className="text-xs" style={{ color: "#555560" }}>{e.time}</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: "#2e2e3a" }} />
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <nav
        className="flex-shrink-0 flex items-end pb-8 pt-2 px-2"
        style={{
          background: "#0c0c0e",
          borderTop: "1px solid #141418",
        }}
      >
        {nav.map((item) => (
          <button
            key={item.label}
            className="flex-1 flex flex-col items-center gap-1.5 relative"
          >
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl relative"
              style={{
                background: item.active ? "#1a1a28" : "transparent",
              }}
            >
              <item.icon
                className="w-5 h-5"
                style={{ color: item.active ? "#818cf8" : "#555560" }}
              />
              {item.badge && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-semibold flex items-center justify-center"
                  style={{ background: "#818cf8", color: "#fff" }}
                >
                  {item.badge}
                </span>
              )}
            </div>
            <span
              className="text-[10px] font-medium"
              style={{ color: item.active ? "#818cf8" : "#555560" }}
            >
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
