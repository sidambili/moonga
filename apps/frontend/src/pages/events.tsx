import { useState } from "react";
import { useListEvents, getListEventsQueryKey } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { Radio, ChevronRight } from "lucide-react";

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-blue-400",
};

export default function EventsFeed() {
  const [sourceFilter, setSourceFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const listParams = {
    source: sourceFilter === "all" ? undefined : sourceFilter,
    severity: severityFilter === "all" ? undefined : severityFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  };
  const { data: eventsList, isLoading } = useListEvents(listParams, {
    query: { queryKey: getListEventsQueryKey(listParams), refetchInterval: 15000 },
  });

  const items = eventsList?.items ?? [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            Events Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Inbound intelligence stream</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border/60 rounded-lg">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="github">GitHub</SelectItem>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="sentry">Sentry</SelectItem>
            <SelectItem value="betterstack">Better Stack</SelectItem>
            <SelectItem value="slack">Slack</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border/60 rounded-lg">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border/60 rounded-lg">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-xl bg-card border border-border/60 py-12 text-center text-sm text-muted-foreground">
            Loading events...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-card border border-border/60 py-12 text-center text-sm text-muted-foreground">
            No events match the current filters.
          </div>
        ) : (
          items.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`}>
              <div className="flex items-center gap-3 rounded-xl bg-card border border-border/60 px-4 py-3.5 hover:bg-accent/50 transition-colors cursor-pointer">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${severityDot[event.severity] ?? "bg-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {event.title || `${event.source} ${event.event_type}`}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <SourceIcon source={event.source} className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground capitalize">{event.source}</span>
                    {event.event_type && (
                      <>
                        <span className="text-xs text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{event.event_type}</span>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground">{formatRelative(event.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <SeverityBadge severity={event.severity} />
                  <StatusBadge status={event.status} />
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 hidden md:block" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
