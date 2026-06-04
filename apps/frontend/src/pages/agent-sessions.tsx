import { useState, useEffect } from "react";
import { useListAgentSessions, getListAgentSessionsQueryKey } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import { SourceIcon, StatusBadge, ObjectivePill, formatEventType, formatSource } from "@/components/ui-helpers";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { DEFAULT_PAGE_SIZE, SESSION_STATUSES, SESSION_STATUS_LABELS } from "@workspace/constants";

function Confidence({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-muted-foreground tabular-nums">—</span>;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "text-emerald-500" : score >= 0.6 ? "text-yellow-500" : "text-orange-500";
  return <span className={`text-xs font-medium tabular-nums ${color}`}>{pct}%</span>;
}

export default function Sessions() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setCursors([undefined]);
    setPageIndex(0);
  }, [statusFilter]);

  const currentCursor = cursors[pageIndex];
  const listParams = {
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: DEFAULT_PAGE_SIZE,
    cursor: currentCursor,
  };
  const { data: sessionsList, isLoading } = useListAgentSessions(listParams, {
    query: { queryKey: getListAgentSessionsQueryKey(listParams), refetchInterval: 15000 },
  });

  const items = sessionsList?.items ?? [];
  const hasMore = sessionsList?.hasMore ?? false;
  const hasPrev = pageIndex > 0;

  const goNext = () => {
    if (isLoading || !hasMore) return;
    if (sessionsList?.nextCursor && pageIndex === cursors.length - 1) {
      setCursors((prev) => [...prev, sessionsList.nextCursor!]);
    }
    setPageIndex((p) => p + 1);
  };

  const goPrev = () => {
    if (isLoading || pageIndex <= 0) return;
    setPageIndex((p) => p - 1);
  };

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sessions</span>
            {items.length > 0 && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {items.length}
              </span>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-7 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SESSION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{SESSION_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No sessions found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-24">Objective</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Event</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-28 hidden sm:table-cell">Source</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-32 hidden md:table-cell">Status</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-20 hidden md:table-cell">Confidence</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-28">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((session) => (
                <tr
                  key={session.id}
                  className="hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/agent-sessions/${session.id}`)}
                >
                  <td className="px-4 py-3">
                    <ObjectivePill objective={session.objective} />
                  </td>
                  <td className="px-4 py-3 max-w-0">
                    <p className="text-sm font-medium truncate">
                      {session.event?.title || (session.event?.event_type ? formatEventType(session.event.event_type) : `Session #${session.id}`)}
                    </p>
                    {session.output_summary ? (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {session.output_summary.replace(/[#*_`[\]]/g, "").slice(0, 120)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 mt-0.5 italic">In progress…</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {session.event && (
                      <div className="flex items-center gap-1.5">
                        <SourceIcon source={session.event.source} className="w-3.5 h-3.5 opacity-60" />
                        <span className="text-xs text-muted-foreground">{formatSource(session.event.source)}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <Confidence score={session.confidence_score} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatRelative(session.updated_at)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 hidden md:block" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(hasPrev || hasMore) && (
          <div className="border-t border-border px-4 py-3">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={hasPrev && !isLoading ? goPrev : undefined}
                    aria-disabled={!hasPrev || isLoading}
                    className={!hasPrev || isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={hasMore && !isLoading ? goNext : undefined}
                    aria-disabled={!hasMore || isLoading}
                    className={!hasMore || isLoading ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

    </div>
  );
}
