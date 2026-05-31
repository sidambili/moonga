import { useState } from "react";
import { useLocation } from "wouter";
import { useListArtifacts, useApproveArtifact, useRejectArtifact, getListArtifactsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { ApprovalBadge, ArtifactTypeBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { FileCheck2, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MarkdownPreview } from "@/components/markdown";

export default function ArtifactsReview() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const sessionIdParam = searchParams.get("session_id");

  const [approvalFilter, setApprovalFilter] = useState("all");
  const queryClient = useQueryClient();
  const approveMutation = useApproveArtifact();
  const rejectMutation = useRejectArtifact();

  const listParams = {
    approval_state: approvalFilter === "all" ? undefined : approvalFilter,
    session_id: sessionIdParam ? Number(sessionIdParam) : undefined,
    limit: 50,
  };
  const { data: artifactsList, isLoading } = useListArtifacts(listParams, {
    query: { queryKey: getListArtifactsQueryKey(listParams), refetchInterval: 15000 },
  });

  const handleApprove = (id: number) => {
    approveMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Artifact approved" });
        queryClient.invalidateQueries({ queryKey: getListArtifactsQueryKey() });
      },
    });
  };

  const handleReject = (id: number) => {
    rejectMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Artifact rejected" });
        queryClient.invalidateQueries({ queryKey: getListArtifactsQueryKey() });
      },
    });
  };

  const items = artifactsList?.items ?? [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-primary" />
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Human approval gate</p>
        </div>
        <Select value={approvalFilter} onValueChange={setApprovalFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border/60 rounded-lg">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="edited">Edited</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-xl bg-card border border-border/60 py-12 text-center text-sm text-muted-foreground">
            Loading review queue...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-card border border-border/60 py-12 text-center text-sm text-muted-foreground">
            No artifacts match the current filter.
          </div>
        ) : (
          items.map((artifact) => (
            <div key={artifact.id} className="rounded-xl bg-card border border-border/60 px-4 py-3.5 space-y-3">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ArtifactTypeBadge type={artifact.type} />
                  <ApprovalBadge state={artifact.approval_state} />
                  <span className="text-xs text-muted-foreground">#{artifact.id}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{formatRelative(artifact.created_at)}</span>
                  <Link href={`/artifacts/${artifact.id}`}>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 rounded-lg">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Content preview */}
              <Link href={`/artifacts/${artifact.id}`}>
                <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2 hover:text-foreground transition-colors cursor-pointer">
                  <MarkdownPreview>{artifact.content}</MarkdownPreview>
                </div>
              </Link>

              {/* Bottom row */}
              <div className="flex items-center justify-between">
                <Link href={`/sessions/${artifact.session_id}`} className="text-xs text-primary hover:underline">
                  Session #{artifact.session_id}
                </Link>

                {artifact.approval_state === "draft" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs rounded-lg text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400"
                      onClick={() => handleApprove(artifact.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs rounded-lg text-red-400 border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => handleReject(artifact.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
