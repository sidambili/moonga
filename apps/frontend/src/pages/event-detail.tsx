import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetEvent, getGetEventQueryKey, useListAgentSessions, getListAgentSessionsQueryKey, useListArtifacts, getListArtifactsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, ExternalLink, Copy, Check, ChevronDown, Bot } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge, formatEventType, formatSource, formatEventResolution, ApprovalBadge, ArtifactTypeBadge } from "@/components/ui-helpers";
import { EventPayloadRenderer } from "@/components/event-payload-renderers";

export default function EventDetail() {
  const [, params] = useRoute("/events/:id");
  const id = Number(params?.id);
  const { data: event, isLoading } = useGetEvent(id, { query: { queryKey: getGetEventQueryKey(id), enabled: !!id } });
  const { data: sessionsData } = useListAgentSessions(
    { event_id: id },
    { query: { queryKey: getListAgentSessionsQueryKey({ event_id: id }), enabled: !!id } }
  );
  const linkedSessions = sessionsData?.items ?? [];
  const { data: artifactsData } = useListArtifacts(
    { event_id: id },
    { query: { queryKey: getListArtifactsQueryKey({ event_id: id }), enabled: !!id } }
  );
  const linkedArtifacts = artifactsData?.items ?? [];
  const [, navigate] = useLocation();
  const [rawOpen, setRawOpen] = useState(false);
  const [rawCopied, setRawCopied] = useState(false);

  const handleCopyRaw = async () => {
    if (!event?.payload_raw) return;
    const text = JSON.stringify(event.payload_raw, null, 2);
    await navigator.clipboard.writeText(text);
    setRawCopied(true);
    setTimeout(() => setRawCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="px-5 py-5 max-w-6xl mx-auto">
        <div className="text-sm text-muted-foreground animate-pulse">Loading event…</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="px-5 py-5 max-w-6xl mx-auto space-y-4">
        <Link href="/events">
          <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Events
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground">Event not found.</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">
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
          <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
            <SourceIcon source={event.source} className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight leading-snug">
              {event.title || `${formatSource(event.source)} ${formatEventType(event.event_type)}`}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <SeverityBadge severity={event.severity} />
              <StatusBadge status={event.status} />
              {event.resolution && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-500">
                  {formatEventResolution(event.resolution)}
                </span>
              )}
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                {formatEventType(event.event_type)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metadata & Session link */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Event Metadata</p>
          <div className="space-y-2">
            {[
              ["ID", `#${event.id}`],
              ["Source", formatSource(event.source)],
              ["Type", formatEventType(event.event_type)],
              ["Received", formatDate(event.created_at)],
              ["Age", formatRelative(event.created_at)],
              ...(event.service ? [["Service", event.service]] : []),
              ...(event.repo_id ? [["Repo", event.repo_id]] : []),
              ...(event.ticket_id ? [["Ticket", event.ticket_id]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium text-right truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {linkedSessions.length > 0 && (
          <div className="rounded-lg border border-primary/20 bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">Linked Agent Sessions</p>
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {linkedSessions.length}
              </span>
            </div>
            <div className="space-y-1">
              {linkedSessions.map((session) => (
                <Link key={session.id} href={`/agent-sessions/${session.id}`}>
                  <div className="flex items-center gap-3 p-2 -mx-2 rounded-md hover:bg-muted/40 transition-colors cursor-pointer group">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                        Session #{session.id}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {session.objective}
                      </p>
                    </div>
                    <StatusBadge status={session.status} />
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Artifacts */}
      {linkedArtifacts.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Artifacts</span>
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {linkedArtifacts.length}
              </span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-[11px] font-medium text-muted-foreground text-left px-4 py-2">Type</th>
                <th className="text-[11px] font-medium text-muted-foreground text-left px-4 py-2">Preview</th>
                <th className="text-[11px] font-medium text-muted-foreground text-left px-4 py-2 hidden sm:table-cell">Session</th>
                <th className="text-[11px] font-medium text-muted-foreground text-left px-4 py-2 hidden md:table-cell">State</th>
                <th className="text-[11px] font-medium text-muted-foreground text-left px-4 py-2 hidden md:table-cell">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linkedArtifacts.map((artifact) => (
                <tr
                  key={artifact.id}
                  className="hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/artifacts/${artifact.id}`)}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <ArtifactTypeBadge type={artifact.type} />
                  </td>
                  <td className="px-4 py-2.5 max-w-0">
                    <p className="text-sm truncate text-muted-foreground">
                      {artifact.content.replace(/[#*_`[\]]/g, "").slice(0, 120)}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell whitespace-nowrap">
                    <Link
                      href={`/agent-sessions/${artifact.session_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      #{artifact.session_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell whitespace-nowrap">
                    <ApprovalBadge state={artifact.approval_state} />
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {formatRelative(artifact.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Source-specific payload */}
      {event.payload_raw && (
        <EventPayloadRenderer source={event.source} payload={event.payload_raw as Record<string, unknown>} />
      )}

      {/* Raw payload — always available, collapsed by default */}
      {event.payload_raw && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Collapsible open={rawOpen} onOpenChange={setRawOpen}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">Raw Payload</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 rounded-md" onClick={handleCopyRaw}>
                  {rawCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="ml-1.5 text-xs">{rawCopied ? "Copied" : "Copy"}</span>
                </Button>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 rounded-md">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${rawOpen ? "rotate-180" : ""}`} />
                    <span className="ml-1.5 text-xs">{rawOpen ? "Hide" : "Show"}</span>
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent>
              <pre className="text-xs bg-muted/50 p-4 overflow-auto max-h-96 text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
                {JSON.stringify(event.payload_raw, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
