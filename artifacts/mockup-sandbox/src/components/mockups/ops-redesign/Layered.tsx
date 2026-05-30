import { LayoutDashboard, Radio, Cpu, FileCheck2, PlugZap, Bell, ArrowUpRight, TrendingUp, AlertTriangle, Clock } from "lucide-react";

const nav = [
  { label: "Home", icon: LayoutDashboard, active: true },
  { label: "Events", icon: Radio },
  { label: "Agents", icon: Cpu },
  { label: "Review", icon: FileCheck2, badge: 2 },
  { label: "Connect", icon: PlugZap },
];

type Severity = "critical" | "high" | "medium" | "low";

const events: { title: string; source: string; severity: Severity; tag: string; time: string }[] = [
  { title: "TypeError: Cannot read properties of null", source: "Sentry", severity: "critical", tag: "error", time: "2m" },
  { title: "Database latency above 2s threshold", source: "BetterStack", severity: "high", tag: "alert", time: "18m" },
  { title: "Add dark mode support to dashboard", source: "Linear", severity: "low", tag: "task", time: "1h" },
  { title: "Push: Fix null check in auth handler", source: "GitHub", severity: "low", tag: "push", time: "2h" },
];

const severityConfig: Record<Severity, { bg: string; text: string; label: string }> = {
  critical: { bg: "rgba(239,68,68,0.12)", text: "#f87171", label: "Critical" },
  high:     { bg: "rgba(251,146,60,0.12)", text: "#fb923c", label: "High" },
  medium:   { bg: "rgba(251,191,36,0.10)", text: "#fbbf24", label: "Med" },
  low:      { bg: "rgba(148,163,184,0.10)", text: "#94a3b8", label: "Low" },
};

export function Layered() {
  return (
    <div
      className="flex flex-col h-screen w-full overflow-hidden select-none"
      style={{
        background: "#0d0d12",
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: "#d1d1db",
      }}
    >
      {/* Status bar + header */}
      <div className="px-5 pt-12 pb-5 flex-shrink-0">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.2)" }}
            >
              <LayoutDashboard className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
            </div>
            <span className="font-semibold text-sm tracking-tight">Ops Bridge</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Nominal
            </div>
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center relative"
              style={{ background: "#161620" }}
            >
              <Bell className="w-3.5 h-3.5" style={{ color: "#6b6b7e" }} />
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                style={{ background: "#f87171" }}
              />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl p-4"
            style={{ background: "#131319", border: "1px solid #1c1c26" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium" style={{ color: "#6b6b7e" }}>Total Events</span>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: "#6b6b7e" }} />
            </div>
            <p className="text-3xl font-bold" style={{ color: "#e4e4ef" }}>8</p>
            <p className="text-xs mt-1" style={{ color: "#6b6b7e" }}>+3 today</p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium" style={{ color: "#f87171" }}>Critical</span>
              <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#f87171" }} />
            </div>
            <p className="text-3xl font-bold" style={{ color: "#f87171" }}>1</p>
            <p className="text-xs mt-1" style={{ color: "rgba(248,113,113,0.6)" }}>Needs attention</p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(251,146,60,0.07)", border: "1px solid rgba(251,146,60,0.12)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium" style={{ color: "#fb923c" }}>Pending Review</span>
              <Clock className="w-3.5 h-3.5" style={{ color: "#fb923c" }} />
            </div>
            <p className="text-3xl font-bold" style={{ color: "#fb923c" }}>2</p>
            <p className="text-xs mt-1" style={{ color: "rgba(251,146,60,0.6)" }}>Awaiting approval</p>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium" style={{ color: "#818cf8" }}>Sessions</span>
              <Cpu className="w-3.5 h-3.5" style={{ color: "#818cf8" }} />
            </div>
            <p className="text-3xl font-bold" style={{ color: "#818cf8" }}>1</p>
            <p className="text-xs mt-1" style={{ color: "rgba(129,140,248,0.6)" }}>1 running</p>
          </div>
        </div>
      </div>

      {/* Recent events */}
      <div className="flex-1 overflow-y-auto px-5 min-h-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#3d3d50" }}>
            Recent
          </p>
          <button className="flex items-center gap-1 text-xs font-medium" style={{ color: "#6366f1" }}>
            All events <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2 pb-4">
          {events.map((e, i) => {
            const cfg = severityConfig[e.severity];
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: "#131319", border: "1px solid #1c1c26" }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: cfg.bg }}
                >
                  <span className="text-[10px] font-bold" style={{ color: cfg.text }}>
                    {cfg.label.slice(0, 1)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-snug" style={{ color: "#d1d1db" }}>
                    {e.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#4a4a5c" }}>
                    {e.source} · {e.time} ago
                  </p>
                </div>
                <div
                  className="flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold"
                  style={{ background: cfg.bg, color: cfg.text }}
                >
                  {cfg.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom nav */}
      <nav
        className="flex-shrink-0 pb-8 pt-3 px-4"
        style={{
          background: "#0d0d12",
          borderTop: "1px solid #151520",
        }}
      >
        <div
          className="flex items-center rounded-2xl px-2 py-1"
          style={{ background: "#131319", border: "1px solid #1c1c26" }}
        >
          {nav.map((item) => (
            <button
              key={item.label}
              className="flex-1 flex flex-col items-center gap-1 py-2 relative"
            >
              <div className="relative">
                <item.icon
                  className="w-5 h-5"
                  style={{ color: item.active ? "#818cf8" : "#4a4a5c" }}
                />
                {item.badge && (
                  <span
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center"
                    style={{ background: "#6366f1", color: "#fff" }}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className="text-[9px] font-medium"
                style={{ color: item.active ? "#818cf8" : "#4a4a5c" }}
              >
                {item.label}
              </span>
              {item.active && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                  style={{ background: "#818cf8" }}
                />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
