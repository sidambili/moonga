import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListArtifacts, useApproveArtifact, useRejectArtifact, getListArtifactsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { ApprovalBadge, ArtifactTypeBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { DEFAULT_PAGE_SIZE } from "@workspace/constants";

export default function ArtifactsReview() {
  const [location, navigate] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const sessionIdParam = searchParams.get("session_id");

  const [approvalFilter, setApprovalFilter] = useState("all");
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const queryClient = useQueryClient();
  const approveMutation = useApproveArtifact();
  const rejectMutation = useRejectArtifact();

  useEffect(() => {
    setCursors([undefined]);
    setPageIndex(0);
  }, [approvalFilter, sessionIdParam]);

  const currentCursor = cursors[pageIndex];
  const listParams = {
    approval_state: approvalFilter === "all" ? undefined : approvalFilter,
    session_id: sessionIdParam ? Number(sessionIdParam) : undefined,
    limit: DEFAULT_PAGE_SIZE,
    cursor: currentCursor,
  };
  const { data: artifactsList, isLoading } = useListArtifacts(listParams, {
    query: { queryKey: getListArtifactsQueryKey(listParams), refetchInterval: 15000 },
  });

  const handleApprove = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    approveMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Artifact approved" });
        queryClient.invalidateQueries({ queryKey: getListArtifactsQueryKey() });
      },
    });
  };

  const handleReject = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    rejectMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Artifact rejected" });
        queryClient.invalidateQueries({ queryKey: getListArtifactsQueryKey() });
      },
    });
  };

  const items = artifactsList?.items ?? [];
  const hasMore = artifactsList?.hasMore ?? false;
  const hasPrev = pageIndex > 0;
  const draftCount = items.filter((a) => a.approval_state === "draft").length;

  const goNext = () => {
    if (!artifactsList?.nextCursor && pageIndex === cursors.length - 1) return;
    if (artifactsList?.nextCursor && pageIndex === cursors.length - 1) {
      setCursors((prev) => [...prev, artifactsList.nextCursor!]);
    }
    setPageIndex((p) => p + 1);
  };

  const goPrev = () => {
    if (pageIndex <= 0) return;
    setPageIndex((p) => p - 1);
  };

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Review Queue</span>
            {draftCount > 0 && (
              <span className="text-[11px] font-medium text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded tabular-nums">
                {draftCount} pending
              </span>
            )}
            {items.length > 0 && draftCount === 0 && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {items.length}
              </span>
            )}
          </div>
          <Select value={approvalFilter} onValueChange={setApprovalFilter}>
            <SelectTrigger className="w-[130px] h-7 text-xs">
              <SelectValue placeholder="State" />
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

        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No artifacts match the current filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-20">Type</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">Content</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-24 hidden sm:table-cell">Session</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground w-24 hidden sm:table-cell">State</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-24 hidden md:table-cell">Time</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-44">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((artifact) => (
                <tr
                  key={artifact.id}
                  className="hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/artifacts/${artifact.id}`)}
                >
                  <td className="px-4 py-3">
                    <ArtifactTypeBadge type={artifact.type} />
                  </td>
                  <td className="px-4 py-3 max-w-0">
                    <p className="text-sm text-muted-foreground truncate">
                      {artifact.content.replace(/[#*_`[\]]/g, "").slice(0, 140)}
                    </p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Link
                      href={`/sessions/${artifact.session_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline"
                    >
                      #{artifact.session_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <ApprovalBadge state={artifact.approval_state} />
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatRelative(artifact.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {artifact.approval_state === "draft" ? (
                      <div className="flex items-center justify-end gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 rounded-full text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800 dark:hover:bg-emerald-950"
                              onClick={(e) => handleApprove(e, artifact.id)}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Approve</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 rounded-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950"
                              onClick={(e) => handleReject(e, artifact.id)}
                              disabled={rejectMutation.isPending}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reject</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 ml-auto" />
                    )}
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
