import { useState } from "react";
import { useGetSessionSteps, getGetSessionStepsQueryKey } from "@workspace/api-client-react";
import type { SessionStep } from "@workspace/api-client-react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

const SYSTEM_TOOL_NAMES = new Set([
  "create_artifact", "post_linear_comment", "post_slack_reply",
  "gather_event_context", "fetch_repo_instructions",
]);

function formatCost(cost: number | null | undefined) {
  if (cost == null || cost === 0) return null;
  if (cost < 0.001) return "<$0.001";
  return `$${cost.toFixed(4)}`;
}

function formatTokens(n: number | null | undefined) {
  if (n == null || n === 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${n} tok`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

type RawToolCall = { toolName?: string; function?: { name: string }; args?: unknown };

type ToolCallItem = {
  name: string;
  args?: unknown;
  result?: SessionStep;
};

type ArtifactOutput = {
  content: string;
  summary: string;
  confidence?: number;
};

function tryParseArtifactOutput(text: string | null | undefined): ArtifactOutput | null {
  if (!text) return null;
  // Mirror server-side parseAgentOutput: strip fences, then find outermost { }
  const stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const p = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof p.content === "string" && p.content.trim() && (typeof p.summary === "string" || typeof p.slack_summary === "string")) {
      return {
        content: p.content,
        summary: (p.summary ?? p.slack_summary) as string,
        confidence: typeof p.confidence === "number" ? p.confidence : undefined,
      };
    }
  } catch {
    // not parseable
  }
  return null;
}

type VisualGroup =
  | { kind: "thinking"; step: SessionStep; durationMs?: number }
  | { kind: "tool_group"; call: SessionStep; items: ToolCallItem[]; isSystem: boolean }
  | { kind: "user"; step: SessionStep }
  | { kind: "artifact_output"; step: SessionStep; parsed: ArtifactOutput };

function formatToolLabel(name: string, args?: unknown): string {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  switch (name) {
    case "get_file_contents":
      return a.path ? `Read ${a.path}` : "Read file";
    case "get_commit_diff":
      return a.sha ? `Commit ${String(a.sha).slice(0, 8)}` : "Commit diff";
    case "get_pull_request":
      return a.number != null ? `PR #${a.number}` : "Pull request";
    case "get_issue":
      return a.number != null ? `Issue #${a.number}` : "Issue";
    case "get_recent_commits":
      return "Recent commits";
    case "list_directory":
      return a.path ? `Listed ${a.path}` : "Listed root";
    case "search_code": {
      const q = a.query ? String(a.query) : "";
      const p = a.path ? ` in ${a.path}` : "";
      return q ? `Searched ${q.includes(" ") ? `"${q}"` : q}${p}` : "Searched code";
    }
    case "create_artifact":
      return "Artifact created";
    case "post_linear_comment":
      return "Linear comment posted";
    case "post_slack_reply":
      return "Slack reply sent";
    case "gather_event_context":
      return "Gathered context";
    case "fetch_repo_instructions":
      return "Loaded instructions";
    default:
      return name.replace(/_/g, " ");
  }
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function toolGroupSummary(items: ToolCallItem[]): string {
  if (items.length === 0) return "Tool call";
  const first = formatToolLabel(items[0].name, items[0].args);
  if (items.length === 1) return first;
  const extra = items.length - 1;
  const n0 = items[0].name;
  if (n0 === "search_code") {
    return `${first} and performed ${extra} other ${extra === 1 ? "query" : "queries"}`;
  }
  if (n0 === "get_file_contents") {
    const a0 = items[0].args && typeof items[0].args === "object" ? (items[0].args as Record<string, unknown>) : {};
    const filename = a0.path ? basename(String(a0.path)) : first;
    return `Read ${filename} and ${extra} more ${extra === 1 ? "file" : "files"}`;
  }
  return `${first} and ${extra} other ${extra === 1 ? "action" : "actions"}`;
}

function buildVisualGroups(steps: SessionStep[]): VisualGroup[] {
  const groups: VisualGroup[] = [];
  let i = 0;

  while (i < steps.length) {
    const s = steps[i];
    const prevCreatedAt = i > 0 ? steps[i - 1].created_at : undefined;
    const durationMs =
      prevCreatedAt && s.created_at
        ? new Date(s.created_at as string).getTime() -
          new Date(prevCreatedAt as string).getTime()
        : undefined;

    if (s.role === "user") {
      groups.push({ kind: "user", step: s });
      i++;
    } else if (
      s.role === "assistant" &&
      s.tool_calls &&
      (s.tool_calls as unknown[]).length > 0
    ) {
      const rawCalls = s.tool_calls as RawToolCall[];
      let j = i + 1;
      const resultSteps: SessionStep[] = [];
      while (j < steps.length && steps[j].role === "tool") {
        resultSteps.push(steps[j]);
        j++;
      }
      const items: ToolCallItem[] = rawCalls.map((c, idx) => ({
        name: c.toolName ?? c.function?.name ?? "tool",
        args: c.args,
        result: resultSteps[idx],
      }));
      const isSystem = items.every((it) => SYSTEM_TOOL_NAMES.has(it.name));
      groups.push({ kind: "tool_group", call: s, items, isSystem });
      i = j;
    } else if (s.role === "assistant" && s.content) {
      const parsed = tryParseArtifactOutput(s.content);
      if (parsed) {
        groups.push({ kind: "artifact_output", step: s, parsed });
      } else {
        groups.push({
          kind: "thinking",
          step: s,
          durationMs: durationMs != null && durationMs > 0 ? durationMs : undefined,
        });
      }
      i++;
    } else if (s.role === "tool") {
      // Orphan tool step — wrap as single-item group
      const items: ToolCallItem[] = [{ name: s.tool_name ?? "tool", result: s }];
      groups.push({
        kind: "tool_group",
        call: s,
        items,
        isSystem: SYSTEM_TOOL_NAMES.has(s.tool_name ?? ""),
      });
      i++;
    } else {
      i++;
    }
  }

  return groups;
}

function ArtifactOutputRow({ step, parsed }: { step: SessionStep; parsed: ArtifactOutput }) {
  const [open, setOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const confidencePct = parsed.confidence != null ? `${Math.round(parsed.confidence * 100)}%` : null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        )}
        <span className="text-[13px] text-foreground/80 flex-1 min-w-0 truncate">Created summary</span>
        {confidencePct && (
          <span className="text-[10px] tabular-nums text-muted-foreground/45 ml-2 flex-shrink-0">
            {confidencePct} confidence
          </span>
        )}
      </button>
      {open && (
        <div className="pb-1 space-y-0.5">
          <div className="px-4 pl-9 pb-1.5">
            <p className="text-[12px] text-foreground/65 leading-relaxed">{parsed.summary}</p>
          </div>
          <div>
            <button
              onClick={() => setShowFull((v) => !v)}
              className="w-full flex items-center gap-1.5 py-1.5 pl-12 pr-4 hover:bg-muted/20 transition-colors text-left"
            >
              {showFull ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground/35 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground/35 flex-shrink-0" />
              )}
              <span className="text-[11px] text-muted-foreground/50">Show full content</span>
            </button>
            {showFull && (
              <div className="px-4 pb-2 pl-16">
                <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap overflow-auto max-h-64 rounded bg-muted/30 p-2 leading-relaxed">
                  {step.content}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubToolItem({ item }: { item: ToolCallItem }) {
  const [open, setOpen] = useState(false);
  const label = formatToolLabel(item.name, item.args);
  const hasDetail = item.args != null || item.result != null;

  if (!hasDetail) {
    return (
      <div className="flex items-center gap-2 py-1.5 pl-9 pr-4">
        <span className="text-[12px] text-muted-foreground/60">{label}</span>
      </div>
    );
  }

  const resultText =
    item.result?.tool_result != null
      ? typeof item.result.tool_result === "string"
        ? item.result.tool_result
        : JSON.stringify(item.result.tool_result, null, 2)
      : (item.result?.content ?? "");

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 py-1.5 pl-9 pr-4 hover:bg-muted/20 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/35 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/35 flex-shrink-0" />
        )}
        <span className="text-[12px] text-muted-foreground/70">{label}</span>
      </button>
      {open && (
        <div className="px-4 pb-2 pl-14 space-y-1.5">
          {item.args != null && (
            <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap overflow-auto max-h-32 rounded bg-muted/30 p-2 leading-relaxed">
              {JSON.stringify(item.args, null, 2)}
            </pre>
          )}
          {resultText && (
            <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap overflow-auto max-h-40 rounded bg-muted/30 p-2 leading-relaxed">
              {resultText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingRow({ step, durationMs }: { step: SessionStep; durationMs?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-muted/15 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
        )}
        <span className="text-[12px] text-muted-foreground/55">
          Thought
          {durationMs != null && (
            <span className="text-muted-foreground/40"> for {formatDuration(durationMs)}</span>
          )}
        </span>
      </button>
      {open && step.content && (
        <div className="px-4 pb-2 pl-9">
          <p className="text-[11px] text-muted-foreground/55 leading-relaxed italic whitespace-pre-wrap">
            {step.content}
          </p>
        </div>
      )}
    </div>
  );
}

function ToolGroupRow({
  call,
  items,
  isSystem,
}: {
  call: SessionStep;
  items: ToolCallItem[];
  isSystem: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = toolGroupSummary(items);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        )}
        <span
          className={`text-[13px] flex-1 min-w-0 truncate ${
            isSystem ? "text-muted-foreground/50" : "text-foreground/80"
          }`}
        >
          {summary}
        </span>
        {isSystem && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/30 font-medium ml-2 flex-shrink-0">
            system
          </span>
        )}
      </button>
      {open && (
        <div className="pb-1">
          {call.role === "assistant" && call.content && (
            <div className="px-4 pb-2 pl-9">
              <p className="text-[11px] text-muted-foreground/55 leading-relaxed italic whitespace-pre-wrap">
                {call.content}
              </p>
            </div>
          )}
          {items.map((item, i) => (
            <SubToolItem key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ step }: { step: SessionStep }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-muted/15 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
        )}
        <span className="text-[12px] text-muted-foreground/55">Instructions</span>
      </button>
      {open && step.content && (
        <div className="px-4 pb-2 pl-9">
          <pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap overflow-auto max-h-48 rounded bg-muted/30 p-2 leading-relaxed">
            {step.content}
          </pre>
        </div>
      )}
    </div>
  );
}

interface SessionTraceProps {
  sessionId: number;
  totalCost?: number | null;
}

export default function SessionTrace({ sessionId, totalCost }: SessionTraceProps) {
  const { data: steps, isLoading } = useGetSessionSteps(sessionId, {
    query: { queryKey: getGetSessionStepsQueryKey(sessionId), enabled: !!sessionId },
  });

  const groups = steps ? buildVisualGroups(steps) : [];
  const totalTok = steps?.reduce((s, st) => s + (st.tokens_used ?? 0), 0) ?? 0;
  const totalCostComputed = steps?.reduce((s, st) => s + (st.cost ?? 0), 0) ?? 0;
  const displayCost = formatCost(totalCostComputed || totalCost);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="text-sm font-medium">Agent Trace</span>
        <div className="flex items-center gap-2.5">
          {steps && steps.length > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {steps.length} steps
            </span>
          )}
          {displayCost && (
            <span className="text-[11px] text-muted-foreground tabular-nums">{displayCost}</span>
          )}
        </div>
      </div>

      {/* Scrollable feed */}
      <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-border/20">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading…
          </div>
        ) : groups.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            No steps recorded.
          </div>
        ) : (
          groups.map((g, i) => {
            if (g.kind === "thinking") {
              return <ThinkingRow key={i} step={g.step} durationMs={g.durationMs} />;
            }
            if (g.kind === "artifact_output") {
              return <ArtifactOutputRow key={i} step={g.step} parsed={g.parsed} />;
            }
            if (g.kind === "tool_group") {
              return (
                <ToolGroupRow key={i} call={g.call} items={g.items} isSystem={g.isSystem} />
              );
            }
            return <UserRow key={i} step={g.step} />;
          })
        )}
      </div>

      {/* Footer */}
      {(totalTok > 0 || displayCost) && (
        <div className="border-t border-border px-4 py-2 flex items-center justify-between flex-shrink-0">
          {totalTok > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {formatTokens(totalTok)}
            </span>
          )}
          {displayCost && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {displayCost} total
            </span>
          )}
        </div>
      )}
    </div>
  );
}
