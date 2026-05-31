import { useState } from "react";
import { useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import { SourceIcon, StatusBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { Cpu, ChevronRight } from "lucide-react";
import { MarkdownPreview } from "@/components/markdown";

const objectiveColors: Record<string, string> = {
  diagnose: "bg-orange-500/10 text-orange-400",
  plan:     "bg-primary/10 text-primary",
  summarize:"bg-purple-500/10 text-purple-400",
  draft:    "bg-teal-500/10 text-teal-400",
};

function ObjectivePill({ objective }: { objective: string }) {
  const cls = objectiveColors[objective] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {objective}
    </span>
  );
}

function Confidence({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "text-emerald-400" : score >= 0.6 ? "text-yellow-400" : "text-orange-400";
  return <span className={`text-xs font-medium ${color}`}>{pct}%</span>;
}

export default function Sessions() {
  const [statusFilter, setStatusFilter] = useState("all");

  const listParams = {
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  };
  const { data: sessionsList, isLoading } = useListSessions(listParams, {
    query: { queryKey: getListSessionsQueryKey(listParams), refetchInterval: 15000 },
  });

  const items = sessionsList?.items ?? [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            Agent Sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI work units — one per event</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-card border-border/60 rounded-lg">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-xl bg-card border border-border/60 py-12 text-center text-sm text-muted-foreground">
            Loading sessions...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-card border border-border/60 py-12 text-center text-sm text-muted-foreground">
            No sessions found.
          </div>
        ) : (
          items.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <div className="flex items-start gap-3 rounded-xl bg-card border border-border/60 px-4 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <ObjectivePill objective={session.objective} />
                    <span className="text-xs text-muted-foreground">#{session.id}</span>
                  </div>
                  <div className="text-sm font-medium leading-snug line-clamp-2">
                    {session.output_summary
                      ? <MarkdownPreview>{session.output_summary}</MarkdownPreview>
                      : <span className="text-muted-foreground italic">In progress…</span>
                    }
                  </div>
                  {session.event && (
                    <div className="flex items-center gap-1.5">
                      <SourceIcon source={session.event.source} className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground capitalize">{session.event.source}</span>
                      <span className="text-xs text-muted-foreground/40">·</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {session.event.title?.slice(0, 50) || session.event.event_type}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <StatusBadge status={session.status} />
                  <div className="flex items-center gap-2">
                    <Confidence score={session.confidence_score} />
                    <span className="text-xs text-muted-foreground">{formatRelative(session.updated_at)}</span>
                  </div>
                  {(session.step_count != null && session.step_count > 0) && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground/60">{session.step_count} steps</span>
                      {session.total_cost != null && session.total_cost > 0 && (
                        <>
                          <span className="text-[10px] text-muted-foreground/30">·</span>
                          <span className="text-[10px] text-muted-foreground/60">
                            {session.total_cost < 0.001 ? "<$0.001" : `$${session.total_cost.toFixed(4)}`}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0 self-center hidden md:block" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
