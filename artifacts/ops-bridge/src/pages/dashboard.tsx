import { useGetDashboardSummary, useGetRecentActivity, useHealthCheck } from "@workspace/api-client-react";
import { AlertCircle, Activity, LayoutGrid, CheckCircle2, Clock, ShieldAlert, ChevronRight } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { SeverityBadge, StatusBadge, SourceIcon } from "@/components/ui-helpers";
import { Link } from "wouter";

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
};

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({ query: { refetchInterval: 30000 } });
  const { data: recent, isLoading: recentLoading } = useGetRecentActivity({ query: { refetchInterval: 30000 } });
  const { data: health } = useHealthCheck({ query: { refetchInterval: 60000 } });

  const systemOk = health?.status === "ok";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-xl font-semibold tracking-tight mt-0.5">Command Center</h1>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mt-1 ${
          systemOk ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        }`}>
          {systemOk
            ? <><CheckCircle2 className="w-3 h-3" /> Nominal</>
            : <><AlertCircle className="w-3 h-3" /> Degraded</>
          }
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Events", value: summary?.total_events ?? 0, icon: Activity, color: "text-foreground" },
          { label: "Critical", value: summary?.critical_open ?? 0, icon: ShieldAlert, color: "text-red-400" },
          { label: "Pending", value: summary?.pending_review ?? 0, icon: Clock, color: "text-orange-400" },
          { label: "Sessions", value: summary?.sessions_running ?? 0, icon: LayoutGrid, color: "text-primary" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl bg-card border border-border/60 px-4 py-3"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              <s.icon className={`w-3.5 h-3.5 ${s.color} opacity-60`} />
            </div>
            <p className={`text-2xl font-semibold ${s.color}`}>
              {isLoading ? "—" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent events */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">Recent Events</p>
          <Link href="/events">
            <button className="flex items-center gap-0.5 text-xs font-medium text-primary hover:opacity-80 transition-opacity">
              See all <ChevronRight className="w-3 h-3" />
            </button>
          </Link>
        </div>

        <div className="space-y-2">
          {recentLoading ? (
            <div className="rounded-xl bg-card border border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : !recent?.items?.length ? (
            <div className="rounded-xl bg-card border border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              No recent events
            </div>
          ) : (
            recent.items.slice(0, 8).map((event) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <div className="flex items-center gap-3 rounded-xl bg-card border border-border/60 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${severityDot[event.severity] ?? "bg-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.title || `${event.source} ${event.event_type}`}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <SourceIcon source={event.source} className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground capitalize">{event.source}</span>
                      <span className="text-xs text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground">{formatRelative(event.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={event.status} />
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
