import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetArtifact, useApproveArtifact, useRejectArtifact, useEditArtifact, getGetArtifactQueryKey, getListArtifactsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle, XCircle, Edit3, Save, X, ExternalLink } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";

function ApprovalBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    approved: "bg-green-500/10 text-green-500 border-green-500/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    edited: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  };
  return <Badge variant="outline" className={`uppercase text-[10px] font-mono ${colors[state] || ""}`}>{state}</Badge>;
}

export default function ArtifactDetail() {
  const [, params] = useRoute("/artifacts/:id");
  const id = Number(params?.id);
  const { data: artifact, isLoading, refetch } = useGetArtifact(id, { query: { enabled: !!id } });
  const queryClient = useQueryClient();
  const approveMutation = useApproveArtifact();
  const rejectMutation = useRejectArtifact();
  const editMutation = useEditArtifact();

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  const handleApprove = () => {
    approveMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Artifact approved" });
        refetch();
        queryClient.invalidateQueries({ queryKey: getListArtifactsQueryKey() });
      },
    });
  };

  const handleReject = () => {
    rejectMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Artifact rejected" });
        refetch();
        queryClient.invalidateQueries({ queryKey: getListArtifactsQueryKey() });
      },
    });
  };

  const handleStartEdit = () => {
    setEditContent(artifact?.content || "");
    setEditing(true);
  };

  const handleSaveEdit = () => {
    editMutation.mutate({ id, data: { content: editContent } }, {
      onSuccess: () => {
        toast({ title: "Artifact updated" });
        setEditing(false);
        refetch();
        queryClient.invalidateQueries({ queryKey: getGetArtifactQueryKey(id) });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="font-mono text-muted-foreground text-sm animate-pulse">Loading artifact...</div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/artifacts"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
        <div className="font-mono text-muted-foreground">Artifact not found.</div>
      </div>
    );
  }

  const isDraft = artifact.approval_state === "draft" || artifact.approval_state === "edited";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/artifacts">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Review Queue</Button>
        </Link>
        <span className="text-muted-foreground font-mono text-sm">/</span>
        <span className="font-mono text-sm text-muted-foreground">#{artifact.id}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Artifact #{artifact.id}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <ApprovalBadge state={artifact.approval_state} />
            <Badge variant="secondary" className="text-xs font-mono uppercase">{artifact.type.replace("_", " ")}</Badge>
            <span className="text-xs text-muted-foreground font-mono">{formatRelative(artifact.created_at)}</span>
          </div>
        </div>

        {isDraft && !editing && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartEdit}
              className="font-mono text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />EDIT
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="font-mono text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />APPROVE
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
              className="font-mono text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />REJECT
            </Button>
          </div>
        )}
      </div>

      {artifact.session && (
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Originating Session</div>
            <div className="flex items-center gap-3">
              {artifact.session.event && (
                <SourceIcon source={artifact.session.event.source} className="w-4 h-4 text-muted-foreground" />
              )}
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {artifact.session.event?.title || `Session #${artifact.session_id}`}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {artifact.session.event && <SeverityBadge severity={artifact.session.event.severity} />}
                  <Badge variant="outline" className="font-mono text-xs uppercase">{artifact.session.objective}</Badge>
                  {artifact.session.confidence_score != null && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {Math.round(artifact.session.confidence_score * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
              <Link href={`/sessions/${artifact.session_id}`}>
                <Button variant="ghost" size="sm" className="font-mono text-xs">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />SESSION
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border border-primary/10">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Content</CardTitle>
          {editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 font-mono text-xs">
                <X className="w-3.5 h-3.5 mr-1" />CANCEL
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={editMutation.isPending} className="h-7 font-mono text-xs">
                <Save className="w-3.5 h-3.5 mr-1" />SAVE
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="font-mono text-sm min-h-[400px] bg-muted/40 border-border resize-y"
            />
          ) : (
            <pre className="text-sm font-mono bg-muted/40 rounded-md p-4 whitespace-pre-wrap text-foreground leading-relaxed max-h-[600px] overflow-auto">
              {artifact.content}
            </pre>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground font-mono">
        Created: {formatDate(artifact.created_at)}
      </div>
    </div>
  );
}
