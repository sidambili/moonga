import { useRoute, Link } from "wouter";
import { useGetSession, useRetrySession, getGetSessionQueryKey, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, ExternalLink } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";
import Markdown from "@/components/markdown";
import SessionTrace from "@/components/session-trace";

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const id = Number(params?.id);
  const { data: session, isLoading, refetch } = useGetSession(id, { query: { queryKey: getGetSessionQueryKey(id), enabled: !!id } });
  const retryMutation = useRetrySession();
  const queryClient = useQueryClient();

  const handleRetry = () => {
    retryMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Session queued for retry" });
        refetch();
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="text-sm text-muted-foreground animate-pulse">Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <Link href="/sessions">
          <Button variant="ghost" size="sm" className="rounded-lg">
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground">Session not found.</p>
      </div>
    );
  }

  const objectiveCls = session.objective === "plan"
    ? "bg-primary/10 text-primary"
    : "bg-muted text-muted-foreground";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/sessions">
          <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Sessions
          </Button>
        </Link>
        <span>/</span>
        <span>#{session.id}</span>
      </div>

      {/* Title + actions */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Agent Session #{session.id}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={session.status} />
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${objectiveCls}`}>
              {session.objective}
            </span>
            {session.model_used && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                {session.model_used}
              </span>
            )}
            {session.confidence_score != null && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                {Math.round(session.confidence_score * 100)}% confidence
              </span>
            )}
          </div>
        </div>
        {(session.status === "failed" || session.status === "rejected") && (
          <Button variant="outline" size="sm" onClick={handleRetry} disabled={retryMutation.isPending} className="rounded-lg text-sm self-start">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${retryMutation.isPending ? "animate-spin" : ""}`} />
            Retry Session
          </Button>
        )}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">

        {/* Left: content */}
        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl bg-card border border-border/60 p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Timing</p>
              {[
                ["Created", formatDate(session.created_at)],
                ["Updated", formatDate(session.updated_at)],
                ["Age", formatRelative(session.updated_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>

            {session.event && (
              <div className="rounded-xl bg-card border border-border/60 p-4 md:col-span-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Triggering Event</p>
                <Link href={`/events/${session.event_id}`}>
                  <div className="flex items-start gap-3 group cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <SourceIcon source={session.event.source} className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1">
                        {session.event.title || `${session.event.source} ${session.event.event_type}`}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <SeverityBadge severity={session.event.severity} />
                        <span className="text-xs text-muted-foreground">{session.event.event_type}</span>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* Agent output */}
          {session.output_summary && (
            <div className="rounded-xl bg-card border border-border/60 p-5 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Output</p>
              <Markdown>{session.output_summary}</Markdown>
            </div>
          )}

          {/* Context snapshot */}
          {session.context_snapshot && (
            <div className="rounded-xl bg-card border border-border/60 p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Context Snapshot</p>
              <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-auto max-h-64 text-foreground/70 whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(session.context_snapshot, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex justify-end">
            <Link href={`/artifacts?session_id=${session.id}`}>
              <Button variant="outline" size="sm" className="rounded-lg text-sm">
                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                View Artifacts
              </Button>
            </Link>
          </div>
        </div>

        {/* Right: agent trace — sticky on large screens */}
        <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-6rem)] flex flex-col">
          <SessionTrace sessionId={session.id} totalCost={session.total_cost} />
        </div>
      </div>
    </div>
  );
}
