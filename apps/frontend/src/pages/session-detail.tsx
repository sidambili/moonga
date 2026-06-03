import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetSession, useRetrySession, useRerunSession, getGetSessionQueryKey, getListSessionsQueryKey,
  useListArtifacts, useApproveArtifact, useRejectArtifact, useEditArtifact, usePostArtifactToLinear,
  getListArtifactsQueryKey,
} from "@workspace/api-client-react";
import type { Artifact } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, RefreshCw, RotateCcw, ExternalLink, CheckCircle, XCircle, Edit3, Save, X, Copy, Check, ChevronDown, BookOpen } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge, ApprovalBadge, ArtifactTypeBadge, formatEventType, formatObjective, formatSource } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";
import Markdown from "@/components/markdown";
import SessionTrace from "@/components/session-trace";
import { SiLinear } from "react-icons/si";

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 rounded-md" onClick={handleCopy}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      <span className="ml-1.5 text-xs">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

function InlineArtifact({ artifact }: { artifact: Artifact }) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const queryClient = useQueryClient();

  const approveMutation = useApproveArtifact();
  const rejectMutation = useRejectArtifact();
  const editMutation = useEditArtifact();
  const postToLinearMutation = usePostArtifactToLinear();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListArtifactsQueryKey() });
  };

  const handleApprove = () => {
    approveMutation.mutate({ id: artifact.id }, {
      onSuccess: () => { toast({ title: "Artifact approved" }); invalidate(); },
      onError: (err: any) => {
        const message = err?.message || String(err);
        toast({ title: "Failed to approve", description: message, variant: "destructive" });
      },
    });
  };

  const handleReject = () => {
    rejectMutation.mutate({ id: artifact.id }, {
      onSuccess: () => { toast({ title: "Artifact rejected" }); invalidate(); },
      onError: (err: any) => {
        const message = err?.message || String(err);
        toast({ title: "Failed to reject", description: message, variant: "destructive" });
      },
    });
  };

  const handleSaveEdit = () => {
    editMutation.mutate({ id: artifact.id, data: { content: editContent } }, {
      onSuccess: () => { toast({ title: "Artifact updated" }); setEditing(false); invalidate(); },
      onError: (err: any) => {
        const message = err?.message || String(err);
        toast({ title: "Failed to save edit", description: message, variant: "destructive" });
      },
    });
  };

  const handlePostToLinear = () => {
    postToLinearMutation.mutate({ id: artifact.id }, {
      onSuccess: () => { toast({ title: "Posted to Linear" }); invalidate(); },
      onError: (err: any) => {
        const message = err?.message || String(err);
        toast({ title: "Failed to post to Linear", description: message, variant: "destructive" });
      },
    });
  };

  const handleApproveAndPostToLinear = () => {
    approveMutation.mutate({ id: artifact.id }, {
      onSuccess: () => {
        toast({ title: "Artifact approved" });
        postToLinearMutation.mutate({ id: artifact.id }, {
          onSuccess: () => { toast({ title: "Posted to Linear" }); invalidate(); },
          onError: (err: any) => {
            const message = err?.message || String(err);
            toast({ title: "Approved, but failed to post to Linear", description: message, variant: "destructive" });
            invalidate();
          },
        });
      },
      onError: (err: any) => {
        const message = err?.message || String(err);
        toast({ title: "Failed to approve", description: message, variant: "destructive" });
      },
    });
  };

  const isDraft = artifact.approval_state === "draft";
  const isApproved = artifact.approval_state === "approved";
  const isLinear = artifact.session?.event?.source === "linear";
  const canPostToLinear = isApproved && isLinear && !artifact.synced_to_linear_at;
  const hasPostedToLinear = isApproved && isLinear && !!artifact.synced_to_linear_at;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-border gap-y-2">
        <div className="flex items-center gap-2">
          <ArtifactTypeBadge type={artifact.type} />
          <ApprovalBadge state={artifact.approval_state} />
          <span className="text-[11px] text-muted-foreground tabular-nums">#{artifact.id}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isDraft && !editing && (
            <>
              <Button
                variant="ghost" size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setEditContent(artifact.content); setEditing(true); }}
              >
                <Edit3 className="w-3.5 h-3.5 mr-1" />Edit
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={handleReject}
                disabled={rejectMutation.isPending}
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />Reject
              </Button>
              {isLinear ? (
                <div className="flex items-center">
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 px-2 text-xs text-green-600 hover:text-green-700 rounded-r-none"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 px-1 text-xs text-green-600 hover:text-green-700 rounded-l-none border-l-0"
                        disabled={approveMutation.isPending}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleApprove} className="cursor-pointer">
                        <CheckCircle className="w-3.5 h-3.5 mr-2 text-green-600" />
                        <span>Approve</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleApproveAndPostToLinear} className="cursor-pointer">
                        <SiLinear className="w-3.5 h-3.5 mr-2" />
                        <span>Approve & Add to Linear</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <Button
                  variant="ghost" size="sm"
                  className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                </Button>
              )}
            </>
          )}
          {editing && (
            <>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(false)}>
                <X className="w-3.5 h-3.5 mr-1" />Cancel
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 px-2 text-xs text-primary hover:text-primary"
                onClick={handleSaveEdit}
                disabled={editMutation.isPending}
              >
                <Save className="w-3.5 h-3.5 mr-1" />Save
              </Button>
            </>
          )}
          {canPostToLinear && (
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handlePostToLinear}
              disabled={postToLinearMutation.isPending}
            >
              <SiLinear className="w-3.5 h-3.5 mr-1" />Add to Linear
            </Button>
          )}
          {hasPostedToLinear && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
              <SiLinear className="w-3 h-3 mr-1" />Synced to Linear
            </span>
          )}
          <CopyButton text={artifact.content} />
          <Link href={`/artifacts/${artifact.id}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {editing ? (
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[400px] font-mono text-xs resize-y"
          />
        ) : (
          <Markdown>{artifact.content}</Markdown>
        )}
      </div>
    </div>
  );
}

export default function SessionDetail() {
  const [, params] = useRoute("/sessions/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { data: session, isLoading, refetch } = useGetSession(id, { query: { queryKey: getGetSessionQueryKey(id), enabled: !!id } });
  const { data: artifactsData } = useListArtifacts(
    { session_id: id },
    { query: { queryKey: [...getListArtifactsQueryKey(), id], enabled: !!id, refetchInterval: 10_000 } },
  );
  const retryMutation = useRetrySession();
  const rerunMutation = useRerunSession();
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

  const handleRerun = () => {
    rerunMutation.mutate({ id }, {
      onSuccess: (newSession) => {
        toast({ title: `Session ${newSession.id} queued for rerun` });
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        navigate(`/sessions/${newSession.id}`);
      },
      onError: (err: any) => {
        const message = err?.message || String(err);
        toast({ title: "Failed to rerun session", description: message, variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="px-5 py-5 max-w-6xl mx-auto">
        <div className="text-sm text-muted-foreground animate-pulse">Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="px-5 py-5 max-w-6xl mx-auto space-y-4">
        <Link href="/sessions">
          <Button variant="ghost" size="sm" className="rounded-lg">
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground">Session not found.</p>
      </div>
    );
  }

  const artifacts = artifactsData?.items ?? [];
  const objectiveCls = session.objective === "plan"
    ? "bg-primary/10 text-primary"
    : "bg-muted text-muted-foreground";

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">
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
              {formatObjective(session.objective)}
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
            {session.playbook_name && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                <BookOpen className="w-2.5 h-2.5" aria-hidden />
                {session.playbook_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          {(session.status === "failed" || session.status === "rejected") && (
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={retryMutation.isPending} className="rounded-lg text-sm">
              <RefreshCw className={`w-3.5 h-3.5 mr-2 ${retryMutation.isPending ? "animate-spin" : ""}`} />
              Retry Session
            </Button>
          )}
          {session.status !== "pending" && session.status !== "running" && (
            <Button variant="outline" size="sm" onClick={handleRerun} disabled={rerunMutation.isPending} className="rounded-lg text-sm">
              <RotateCcw className={`w-3.5 h-3.5 mr-2 ${rerunMutation.isPending ? "animate-spin" : ""}`} />
              Rerun Session
            </Button>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_480px] gap-5 items-start">

        {/* Left: content */}
        <div className="space-y-4 min-w-0">
          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Timing</p>
              {[
                ["Created", formatDate(session.created_at)],
                ["Updated", formatDate(session.updated_at)],
                ["Age", formatRelative(session.updated_at)],
                ...(session.duration_ms ? [["Duration", formatDuration(session.duration_ms)]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Usage</p>
              {session.total_tokens != null && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Tokens</span>
                  <span className="text-xs font-medium tabular-nums">
                    {session.total_tokens.toLocaleString()}
                    {session.total_prompt_tokens != null && session.total_completion_tokens != null && (
                      <span className="text-muted-foreground/60">
                        {" "}({session.total_prompt_tokens.toLocaleString()}↑ {session.total_completion_tokens.toLocaleString()}↓)
                      </span>
                    )}
                  </span>
                </div>
              )}
              {session.total_cost != null && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Cost</span>
                  <span className="text-xs font-medium tabular-nums">${session.total_cost.toFixed(4)}</span>
                </div>
              )}
              {(session.prompt_token_cost != null || session.completion_token_cost != null) && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Rate</span>
                  <span className="text-xs font-medium tabular-nums">
                    ${session.prompt_token_cost?.toFixed(2) ?? "?"}/${session.completion_token_cost?.toFixed(2) ?? "?"} per 1M
                  </span>
                </div>
              )}
              {session.tool_calls_count != null && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">Tools</span>
                  <span className="text-xs font-medium tabular-nums">{session.tool_calls_count}</span>
                </div>
              )}
            </div>

            {session.event && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Triggering Event</p>
                <Link href={`/events/${session.event_id}`}>
                  <div className="flex items-start gap-3 group cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <SourceIcon source={session.event.source} className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1">
                        {session.event.title || `${formatSource(session.event.source)} ${formatEventType(session.event.event_type)}`}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <SeverityBadge severity={session.event.severity} />
                        <span className="text-xs text-muted-foreground">{formatEventType(session.event.event_type)}</span>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* Slack summary — the 2-3 sentence version posted to Linear/Slack */}
          {session.output_summary && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Summary <span className="text-[11px] font-normal">(posted to Linear / Slack)</span></p>
                <CopyButton text={session.output_summary} />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{session.output_summary}</p>
            </div>
          )}

          {/* Inline artifacts */}
          {artifacts.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground px-0.5">
                Artifacts
                <span className="ml-1.5 text-[11px] bg-muted px-1.5 py-0.5 rounded tabular-nums">{artifacts.length}</span>
              </p>
              {artifacts.map((artifact) => (
                <InlineArtifact key={artifact.id} artifact={artifact} />
              ))}
            </div>
          )}

          {/* Context snapshot */}
          {session.context_snapshot && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Context Snapshot</p>
              <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-auto max-h-64 text-foreground/70 whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(session.context_snapshot, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right: agent trace — sticky on large screens */}
        <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-6rem)] flex flex-col min-w-0">
          <SessionTrace sessionId={session.id} totalCost={session.total_cost} durationMs={session.duration_ms} />
        </div>
      </div>
    </div>
  );
}
