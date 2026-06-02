import { useState, useEffect } from "react";
import { useListEvents, getListEventsQueryKey } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge, formatEventType, formatSource } from "@/components/ui-helpers";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import {
  DEFAULT_PAGE_SIZE,
  SOURCE_IDS,
  SOURCE_LABELS,
  SEVERITY_LEVELS,
  SEVERITY_LABELS,
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
} from "@workspace/constants";

export default function EventsFeed() {
  const [, navigate] = useLocation();
  const [sourceFilter, setSourceFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setCursors([undefined]);
    setPageIndex(0);
  }, [sourceFilter, severityFilter, statusFilter]);

  const currentCursor = cursors[pageIndex];
  const listParams = {
    source: sourceFilter === "all" ? undefined : sourceFilter,
    severity: severityFilter === "all" ? undefined : severityFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: DEFAULT_PAGE_SIZE,
    cursor: currentCursor,
  };
  const { data: eventsList, isLoading } = useListEvents(listParams, {
    query: { queryKey: getListEventsQueryKey(listParams), refetchInterval: 15000 },
  });

  const items = eventsList?.items ?? [];
  const hasMore = eventsList?.hasMore ?? false;
  const hasPrev = pageIndex > 0;

  const goNext = () => {
    if (!hasMore) return;
    if (eventsList?.nextCursor && pageIndex === cursors.length - 1) {
      setCursors((prev) => [...prev, eventsList.nextCursor!]);
    }
    setPageIndex((p) => p + 1);
  };

  const goPrev = () => {
    if (!hasPrev) return;
    setPageIndex((p) => p - 1);
  };

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Events</span>
            {items.length > 0 && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {items.length}
              </span>
            )}
          </div>
          {/* Filters */}
          <div className="flex items-center gap-2">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[120px] h-7 text-xs">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {SOURCE_IDS.map((id) => (
                  <SelectItem key={id} value={id}>{SOURCE_LABELS[id]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[120px] h-7 text-xs hidden sm:flex">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {SEVERITY_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>{SEVERITY_LABELS[level]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-7 text-xs hidden sm:flex">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {EVENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{EVENT_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No events match the current filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-24">Severity</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Title</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-28 hidden sm:table-cell">Source</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-32 hidden md:table-cell">Status</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-28">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((event) => (
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
                      {event.title || `${event.source} ${event.event_type}`}
                    </p>
                    {event.event_type && (
                      <p className="text-xs text-muted-foreground mt-0.5">{formatEventType(event.event_type)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <SourceIcon source={event.source} className="w-3.5 h-3.5 opacity-60" />
                      <span className="text-xs text-muted-foreground">{formatSource(event.source)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <StatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatRelative(event.created_at)}
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
                    onClick={hasPrev ? goPrev : undefined}
                    aria-disabled={!hasPrev}
                    className={!hasPrev ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={hasMore ? goNext : undefined}
                    aria-disabled={!hasMore}
                    className={!hasMore ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
