import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetArtifact, useApproveArtifact, useRejectArtifact, useEditArtifact, getGetArtifactQueryKey, getListArtifactsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle, XCircle, Edit3, Save, X, ExternalLink } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, ApprovalBadge, ArtifactTypeBadge, ObjectivePill } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";
import Markdown from "@/components/markdown";

export default function ArtifactDetail() {
  const [, params] = useRoute("/artifacts/:id");
  const id = Number(params?.id);
  const { data: artifact, isLoading, refetch } = useGetArtifact(id, { query: { queryKey: getGetArtifactQueryKey(id), enabled: !!id } });
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
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="text-sm text-muted-foreground animate-pulse">Loading artifact…</div>
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <Link href="/artifacts">
          <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Review Queue
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground">Artifact not found.</p>
      </div>
    );
  }

  const isDraft = artifact.approval_state === "draft" || artifact.approval_state === "edited";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/artifacts">
          <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Review Queue
          </Button>
        </Link>
        <span>/</span>
        <span>#{artifact.id}</span>
      </div>

      {/* Title + actions */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Artifact #{artifact.id}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <ApprovalBadge state={artifact.approval_state} />
            <ArtifactTypeBadge type={artifact.type} />
            <span className="text-xs text-muted-foreground">{formatRelative(artifact.created_at)}</span>
          </div>
        </div>

        {isDraft && !editing && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartEdit}
              className="text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-400"
            >
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-400"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
              className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />Reject
            </Button>
          </div>
        )}
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl bg-card border border-border/60 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Artifact Info</p>
          {[
            ["ID", `#${artifact.id}`],
            ["Type", artifact.type.replace(/_/g, " ")],
            ["State", artifact.approval_state],
            ["Created", formatDate(artifact.created_at)],
            ["Age", formatRelative(artifact.created_at)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-medium text-right truncate">{value}</span>
            </div>
          ))}
        </div>

        {artifact.session && (
          <div className="rounded-xl bg-card border border-primary/20 p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Originating Session</p>
            <div className="flex items-start gap-3">
              {artifact.session.event && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <SourceIcon source={artifact.session.event.source} className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {artifact.session.event?.title || `Session #${artifact.session_id}`}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {artifact.session.event && <SeverityBadge severity={artifact.session.event.severity} />}
                  <ObjectivePill objective={artifact.session.objective} />
                  {artifact.session.confidence_score != null && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round(artifact.session.confidence_score * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Link href={`/sessions/${artifact.session_id}`}>
              <Button variant="outline" size="sm" className="w-full rounded-lg text-xs">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                View Session #{artifact.session_id}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="rounded-xl bg-card border border-border/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Content</span>
          {editing && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">
                <X className="w-3.5 h-3.5 mr-1" />Cancel
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={editMutation.isPending} className="h-7 text-xs">
                <Save className="w-3.5 h-3.5 mr-1" />Save
              </Button>
            </div>
          )}
        </div>
        <div className="p-4">
          {editing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="font-mono text-sm min-h-[400px] bg-muted/40 border-border resize-y"
            />
          ) : (
            <Markdown>{artifact.content}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
}
