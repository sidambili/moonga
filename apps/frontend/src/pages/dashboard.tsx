import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetRecentActivity,
  getGetRecentActivityQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey,
  useGetSeverityBreakdown,
  getGetSeverityBreakdownQueryKey,
  useGetSourceBreakdown,
  getGetSourceBreakdownQueryKey,
} from "@workspace/api-client-react";
import { Activity, LayoutGrid, Clock, ShieldAlert, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { SeverityBadge, StatusBadge, SourceIcon } from "@/components/ui-helpers";
import { Link, useLocation } from "wouter";
import {
  PieChart as RePieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const SOURCE_COLORS: Record<string, string> = {
  github: "#6b7280",
  linear: "#8b5cf6",
  sentry: "#ef4444",
  betterstack: "#f97316",
  slack: "#3b82f6",
};

function SeverityChart({ data }: { data: Array<{ severity: string; count: number }> }) {
  const chartData = data.map((d) => ({
    name: d.severity,
    value: d.count,
    fill: SEVERITY_COLORS[d.severity] ?? "#6b7280",
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5">
      <div className="flex-shrink-0" style={{ width: 108, height: 108 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RePieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={34}
              outerRadius={50}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <ReTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "11px",
                padding: "5px 10px",
              }}
              formatter={(value: number, name: string) => [value, name]}
            />
          </RePieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 flex-1 min-w-0">
        {chartData.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: d.fill }}
            />
            <span className="text-xs text-muted-foreground capitalize flex-1">{d.name}</span>
            <span className="text-xs font-medium tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceChart({ data }: { data: Array<{ source: string; count: number }> }) {
  const chartData = data.map((d) => ({
    name: d.source,
    count: d.count,
    fill: SOURCE_COLORS[d.source] ?? "#6b7280",
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.6} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <ReTooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "11px",
            padding: "5px 10px",
          }}
          formatter={(value: number) => [value, "events"]}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();

  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 30000 },
  });
  const { data: recent, isLoading: recentLoading } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey(), refetchInterval: 30000 },
  });
  const { data: health } = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 },
  });
  const { data: severityData } = useGetSeverityBreakdown({
    query: { queryKey: getGetSeverityBreakdownQueryKey(), refetchInterval: 30000 },
  });
  const { data: sourceData } = useGetSourceBreakdown({
    query: { queryKey: getGetSourceBreakdownQueryKey(), refetchInterval: 30000 },
  });

  const systemOk = health?.status === "ok";

  const stats = [
    { label: "Total Events",    value: summary?.total_events ?? 0,    icon: Activity,    highlight: false },
    { label: "Critical Open",   value: summary?.critical_open ?? 0,   icon: ShieldAlert, highlight: (summary?.critical_open ?? 0) > 0 },
    { label: "Pending Review",  value: summary?.pending_review ?? 0,  icon: Clock,       highlight: false },
    { label: "Active Sessions", value: summary?.sessions_running ?? 0, icon: LayoutGrid, highlight: false },
  ];

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">

      {/* Context row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <div className="flex items-center gap-1.5">
          {systemOk
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            : <AlertCircle  className="w-3.5 h-3.5 text-red-500" />
          }
          <span className={`text-xs ${systemOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            {systemOk ? "All systems operational" : "System degraded"}
          </span>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-card px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                  <Icon className="w-3.5 h-3.5 text-muted-foreground/40" />
                </div>
                {isLoading ? (
                  <span className="text-2xl font-semibold tabular-nums text-muted-foreground/25">—</span>
                ) : (
                  <span className={`text-2xl font-semibold tabular-nums ${stat.highlight ? "text-red-500" : "text-foreground"}`}>
                    {stat.value}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Severity Distribution</p>
          <SeverityChart data={severityData ?? []} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Events by Source</p>
          <SourceChart data={sourceData ?? []} />
        </div>
      </div>

      {/* Recent Events */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Recent Events</span>
            {!!recent?.length && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {recent.length}
              </span>
            )}
          </div>
          <Link href="/events">
            <button className="flex items-center gap-0.5 text-xs text-primary hover:opacity-75 transition-opacity">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </Link>
        </div>

        {recentLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !recent?.length ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No recent events</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-24">Severity</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Title</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-28 hidden sm:table-cell">Source</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-32 hidden sm:table-cell">Status</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-28">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.slice(0, 12).map((event) => (
                <tr
                  key={event.id}
                  className="hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <td className="px-4 py-3">
                    <SeverityBadge severity={event.severity} />
                  </td>
                  <td className="px-4 py-3 max-w-0">
                    <p className="text-sm font-medium truncate">
                      {event.title || `${event.source} event`}
                    </p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <SourceIcon source={event.source} className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span className="text-xs text-muted-foreground capitalize">{event.source}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {event.status && <StatusBadge status={event.status} />}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatRelative(event.timestamp)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
