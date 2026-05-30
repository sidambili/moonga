import { useRoute, Link } from "wouter";
import { useGetSession, useRetrySession, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, ExternalLink } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const id = Number(params?.id);
  const { data: session, isLoading, refetch } = useGetSession(id, { query: { enabled: !!id } });
  const retryMutation = useRetrySession();
  const queryClient = useQueryClient();

  const handleRetry = () => {
    retryMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Session queued for retry", description: `Session #${id} will be reprocessed.` });
        refetch();
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="font-mono text-muted-foreground text-sm animate-pulse">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/sessions"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
        <div className="font-mono text-muted-foreground">Session not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sessions">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Sessions</Button>
        </Link>
        <span className="text-muted-foreground font-mono text-sm">/</span>
        <span className="font-mono text-sm text-muted-foreground">#{session.id}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Agent Session #{session.id}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={session.status} />
            <Badge variant="outline" className="font-mono text-xs uppercase">{session.objective}</Badge>
            {session.model_used && (
              <Badge variant="outline" className="font-mono text-xs text-muted-foreground">{session.model_used}</Badge>
            )}
            {session.confidence_score != null && (
              <Badge variant="outline" className={`font-mono text-xs ${
                session.confidence_score >= 0.8 ? "text-green-500 border-green-500/20" :
                session.confidence_score >= 0.6 ? "text-yellow-500 border-yellow-500/20" : "text-orange-500 border-orange-500/20"
              }`}>
                {Math.round(session.confidence_score * 100)}% confidence
              </Badge>
            )}
          </div>
        </div>
        {(session.status === "failed" || session.status === "rejected") && (
          <Button variant="outline" size="sm" onClick={handleRetry} disabled={retryMutation.isPending} className="font-mono text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${retryMutation.isPending ? "animate-spin" : ""}`} />
            RETRY SESSION
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 space-y-2">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Timing</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs font-mono">CREATED</span>
              <span className="text-xs font-mono">{formatDate(session.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs font-mono">UPDATED</span>
              <span className="text-xs font-mono">{formatDate(session.updated_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-xs font-mono">AGO</span>
              <span className="text-xs">{formatRelative(session.updated_at)}</span>
            </div>
          </CardContent>
        </Card>

        {session.event && (
          <Card className="bg-card border-border md:col-span-2">
            <CardContent className="pt-4">
              <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Triggering Event</div>
              <Link href={`/events/${session.event_id}`}>
                <div className="flex items-start gap-3 group cursor-pointer">
                  <SourceIcon source={session.event.source} className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1">
                      {session.event.title || `${session.event.source} ${session.event.event_type}`}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <SeverityBadge severity={session.event.severity} />
                      <span className="text-xs text-muted-foreground font-mono">{session.event.event_type}</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {session.output_summary && (
        <Card className="bg-card border-border border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Agent Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm font-mono bg-muted/40 rounded-md p-4 whitespace-pre-wrap text-foreground leading-relaxed">
              {session.output_summary}
            </pre>
          </CardContent>
        </Card>
      )}

      {session.context_snapshot && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Context Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted/40 rounded-md p-4 overflow-auto max-h-64 text-foreground whitespace-pre-wrap">
              {JSON.stringify(session.context_snapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Link href={`/artifacts?session_id=${session.id}`}>
          <Button variant="outline" size="sm" className="font-mono text-xs">
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            VIEW ARTIFACTS FOR THIS SESSION
          </Button>
        </Link>
      </div>
    </div>
  );
}
