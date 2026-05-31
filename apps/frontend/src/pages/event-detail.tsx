import { useRoute, Link } from "wouter";
import { useGetEvent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge } from "@/components/ui-helpers";

export default function EventDetail() {
  const [, params] = useRoute("/events/:id");
  const id = Number(params?.id);
  const { data: event, isLoading } = useGetEvent(id, { query: { enabled: !!id } });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="text-sm text-muted-foreground animate-pulse">Loading event…</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Link href="/events">
          <Button variant="ghost" size="sm" className="rounded-lg">
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground">Event not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/events">
          <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Events
          </Button>
        </Link>
        <span>/</span>
        <span>#{event.id}</span>
      </div>

      {/* Title */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-card border border-border/60 flex items-center justify-center flex-shrink-0 mt-0.5">
            <SourceIcon source={event.source} className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight leading-snug">
              {event.title || `${event.source} ${event.event_type}`}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <SeverityBadge severity={event.severity} />
              <StatusBadge status={event.status} />
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                {event.event_type}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl bg-card border border-border/60 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Event Metadata</p>
          {[
            ["ID", `#${event.id}`],
            ["Source", event.source],
            ["Type", event.event_type],
            event.service && ["Service", event.service],
            event.repo_id && ["Repo", event.repo_id],
            event.ticket_id && ["Ticket", event.ticket_id],
            ["Received", formatDate(event.created_at)],
            ["Age", formatRelative(event.created_at)],
          ].filter(Boolean).map(([label, value]) => (
            <div key={label as string} className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-medium text-right truncate">{value as string}</span>
            </div>
          ))}
        </div>

        {event.session_id && (
          <div className="rounded-xl bg-card border border-primary/20 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Linked Agent Session</p>
            <Link href={`/sessions/${event.session_id}`}>
              <Button variant="outline" className="w-full rounded-lg text-sm">
                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                View Session #{event.session_id}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Raw Payload */}
      <div className="rounded-xl bg-card border border-border/60 p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Raw Payload</p>
        <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-auto max-h-96 text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
          {JSON.stringify(event.payload_raw, null, 2)}
        </pre>
      </div>
    </div>
  );
}
