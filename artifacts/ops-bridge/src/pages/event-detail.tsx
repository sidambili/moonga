import { useRoute, Link } from "wouter";
import { useGetEvent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <div className="p-6 max-w-5xl mx-auto">
        <div className="font-mono text-muted-foreground text-sm animate-pulse">Loading event data...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/events"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
        <div className="font-mono text-muted-foreground">Event not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/events">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Events</Button>
        </Link>
        <span className="text-muted-foreground font-mono text-sm">/</span>
        <span className="font-mono text-sm text-muted-foreground">#{event.id}</span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <SourceIcon source={event.source} className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">{event.title || `${event.source} ${event.event_type}`}</h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <SeverityBadge severity={event.severity} />
          <StatusBadge status={event.status} />
          <Badge variant="outline" className="font-mono text-xs uppercase">{event.event_type}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Event Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground font-mono text-xs">ID</span>
              <span className="font-mono">#{event.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-mono text-xs">SOURCE</span>
              <span className="capitalize">{event.source}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-mono text-xs">TYPE</span>
              <span className="font-mono text-xs">{event.event_type}</span>
            </div>
            {event.service && (
              <div className="flex justify-between">
                <span className="text-muted-foreground font-mono text-xs">SERVICE</span>
                <span className="font-mono text-xs">{event.service}</span>
              </div>
            )}
            {event.repo_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground font-mono text-xs">REPO</span>
                <span className="font-mono text-xs">{event.repo_id}</span>
              </div>
            )}
            {event.ticket_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground font-mono text-xs">TICKET</span>
                <span className="font-mono text-xs text-primary">{event.ticket_id}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground font-mono text-xs">RECEIVED</span>
              <span className="font-mono text-xs">{formatDate(event.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-mono text-xs">AGO</span>
              <span className="text-xs">{formatRelative(event.created_at)}</span>
            </div>
          </CardContent>
        </Card>

        {event.session_id && (
          <Card className="bg-card border-border border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Linked Agent Session</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/sessions/${event.session_id}`}>
                <Button variant="outline" className="w-full font-mono text-xs">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  VIEW SESSION #{event.session_id}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Raw Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs font-mono bg-muted/40 rounded-md p-4 overflow-auto max-h-96 text-foreground whitespace-pre-wrap break-words">
            {JSON.stringify(event.payload_raw, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
