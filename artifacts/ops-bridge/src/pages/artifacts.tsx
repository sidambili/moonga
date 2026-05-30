import { useState } from "react";
import { useLocation } from "wouter";
import { useListArtifacts, useApproveArtifact, useRejectArtifact, getListArtifactsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { StatusBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { FileCheck2, CheckCircle, XCircle, ExternalLink } from "lucide-react";
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

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    slack_message: "Slack",
    linear_ticket: "Linear",
    incident_report: "Incident",
    implementation_plan: "Plan",
  };
  return <Badge variant="secondary" className="text-[10px] font-mono uppercase">{labels[type] || type}</Badge>;
}

export default function ArtifactsReview() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const sessionIdParam = searchParams.get("session_id");

  const [approvalFilter, setApprovalFilter] = useState<string>("all");
  const queryClient = useQueryClient();
  const approveMutation = useApproveArtifact();
  const rejectMutation = useRejectArtifact();

  const { data: artifactsList, isLoading } = useListArtifacts({
    approval_state: approvalFilter === "all" ? undefined : approvalFilter,
    session_id: sessionIdParam ? Number(sessionIdParam) : undefined,
    limit: 50,
  }, { query: { refetchInterval: 15000 } });

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
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileCheck2 className="w-6 h-6 md:w-7 md:h-7 text-primary" />
            Review Queue
          </h1>
          <p className="text-muted-foreground text-xs font-mono mt-1">Human approval gate — nothing goes out unapproved</p>
        </div>
        <Select value={approvalFilter} onValueChange={setApprovalFilter}>
          <SelectTrigger className="w-[160px] font-mono text-xs h-8">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ALL STATES</SelectItem>
            <SelectItem value="draft">DRAFT</SelectItem>
            <SelectItem value="approved">APPROVED</SelectItem>
            <SelectItem value="rejected">REJECTED</SelectItem>
            <SelectItem value="edited">EDITED</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="text-center text-muted-foreground font-mono text-sm py-12">Loading review queue...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground font-mono text-sm py-12">No artifacts matching filter.</div>
        ) : (
          items.map((artifact) => (
            <Card key={artifact.id} className="bg-card/60 border-border">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TypeBadge type={artifact.type} />
                    <span className="text-xs text-muted-foreground font-mono">#{artifact.id}</span>
                  </div>
                  <ApprovalBadge state={artifact.approval_state} />
                </div>
                <Link href={`/artifacts/${artifact.id}`}>
                  <div className="text-xs font-mono text-muted-foreground line-clamp-3">
                    {artifact.content.slice(0, 150)}{artifact.content.length > 150 ? "..." : ""}
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link href={`/sessions/${artifact.session_id}`} className="text-xs text-primary font-mono hover:underline">
                      Session #{artifact.session_id}
                    </Link>
                    <span className="text-xs text-muted-foreground font-mono">{formatRelative(artifact.created_at)}</span>
                  </div>
                  <Link href={`/artifacts/${artifact.id}`}>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
                {artifact.approval_state === "draft" && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-green-500 hover:text-green-400 hover:bg-green-500/10 border-green-500/20 font-mono text-xs"
                      onClick={() => handleApprove(artifact.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" />APPROVE
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 font-mono text-xs"
                      onClick={() => handleReject(artifact.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />REJECT
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card className="border-border">
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[70px] font-mono text-xs">ID</TableHead>
                  <TableHead className="w-[100px] font-mono text-xs">TYPE</TableHead>
                  <TableHead className="font-mono text-xs">CONTENT PREVIEW</TableHead>
                  <TableHead className="w-[110px] font-mono text-xs">STATE</TableHead>
                  <TableHead className="w-[110px] font-mono text-xs">SESSION</TableHead>
                  <TableHead className="w-[130px] text-right font-mono text-xs">CREATED</TableHead>
                  <TableHead className="w-[180px] text-right font-mono text-xs">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-mono text-sm">
                      Loading review queue...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-mono text-sm">
                      No artifacts matching filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((artifact) => (
                    <TableRow key={artifact.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <Link href={`/artifacts/${artifact.id}`} className="hover:text-primary">#{artifact.id}</Link>
                      </TableCell>
                      <TableCell><TypeBadge type={artifact.type} /></TableCell>
                      <TableCell>
                        <Link href={`/artifacts/${artifact.id}`} className="hover:underline decoration-primary underline-offset-4">
                          <div className="text-sm line-clamp-2 font-mono text-xs text-muted-foreground">
                            {artifact.content.slice(0, 120)}{artifact.content.length > 120 ? "..." : ""}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell><ApprovalBadge state={artifact.approval_state} /></TableCell>
                      <TableCell>
                        <Link href={`/sessions/${artifact.session_id}`} className="text-xs text-primary font-mono hover:underline">
                          #{artifact.session_id}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        {formatRelative(artifact.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {artifact.approval_state === "draft" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-green-500 hover:text-green-400 hover:bg-green-500/10 font-mono text-xs px-2"
                                onClick={() => handleApprove(artifact.id)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />APPROVE
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10 font-mono text-xs px-2"
                                onClick={() => handleReject(artifact.id)}
                                disabled={rejectMutation.isPending}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />REJECT
                              </Button>
                            </>
                          )}
                          <Link href={`/artifacts/${artifact.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 font-mono text-xs px-2">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
