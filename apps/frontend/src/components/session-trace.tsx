import { useState } from "react";
import { useGetSessionSteps, getGetSessionStepsQueryKey } from "@workspace/api-client-react";
import type { SessionStep } from "@workspace/api-client-react";
import { ChevronDown, ChevronRight, Wrench, Bot, Loader2, Cpu } from "lucide-react";

const HARNESS_TOOL_NAMES = new Set([
  "create_artifact", "post_linear_comment", "post_slack_reply",
  "gather_event_context", "fetch_repo_instructions",
]);

function isHarnessStep(step: SessionStep): boolean {
  return !!(step.tool_name && HARNESS_TOOL_NAMES.has(step.tool_name));
}

function formatCost(cost: number | null | undefined) {
  if (cost == null || cost === 0) return null;
  if (cost < 0.001) return "<$0.001";
  return `$${cost.toFixed(4)}`;
}

function formatTokens(n: number | null | undefined) {
  if (n == null || n === 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${n} tok`;
}

type ToolCall = { toolName?: string; function?: { name: string }; args?: unknown };

// Group assistant-tool_calls steps with their subsequent tool-result steps
type StepGroup =
  | { kind: "action"; call: SessionStep; results: SessionStep[] }
  | { kind: "message"; step: SessionStep };

function groupSteps(steps: SessionStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  let i = 0;
  while (i < steps.length) {
    const s = steps[i];
    if (s.role === "assistant" && s.tool_calls && (s.tool_calls as unknown[]).length > 0) {
      const results: SessionStep[] = [];
      let j = i + 1;
      while (j < steps.length && steps[j].role === "tool") {
        results.push(steps[j]);
        j++;
      }
      groups.push({ kind: "action", call: s, results });
      i = j;
    } else if (s.role === "tool") {
      groups.push({ kind: "action", call: s, results: [] });
      i++;
    } else {
      groups.push({ kind: "message", step: s });
      i++;
    }
  }
  return groups;
}

function formatToolLabel(name: string, args?: unknown): string {
  const a = args && typeof args === "object" ? args as Record<string, unknown> : {};
  switch (name) {
    case "get_file_contents":
      return a.path ? `Read: ${a.path}` : "Read file";
    case "get_commit_diff":
      return a.sha ? `Commit: ${String(a.sha).slice(0, 12)}` : "Commit diff";
    case "get_pull_request":
      return a.number != null ? `PR #${a.number}` : "Pull request";
    case "get_issue":
      return a.number != null ? `Issue #${a.number}` : "Issue";
    case "get_recent_commits":
      return "Recent commits";
    case "list_directory":
      return a.path ? `List: ${a.path}` : "List: root";
    case "search_code": {
      const q = a.query ? String(a.query) : "";
      return q ? (q.includes(" ") ? `Search: "${q}"` : `Search: ${q}`) : "Search code";
    }
    case "create_artifact":
      return "Artifact created";
    case "post_linear_comment":
      return "Linear comment added";
    case "post_slack_reply":
      return "Slack reply sent";
    case "gather_event_context":
      return "Context gathered";
    case "fetch_repo_instructions":
      return "Instructions loaded";
    default:
      return name;
  }
}

function resultSummary(r: SessionStep): string {
  const v = r.tool_result;
  if (!v) return r.content?.slice(0, 100) ?? "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.replace(/\s+/g, " ").slice(0, 100);
}

function ToolAction({ call, results }: { call: SessionStep; results: SessionStep[] }) {
  const [open, setOpen] = useState(false);
  const harness = isHarnessStep(call);
  const calls = (call.role === "assistant"
    ? (call.tool_calls ?? [])
    : []) as ToolCall[];
  const labels = calls.length
    ? calls.map(c => formatToolLabel(c.toolName ?? c.function?.name ?? "tool", c.args))
    : [formatToolLabel(call.tool_name ?? "tool")];
  const preview = results[0]
    ? resultSummary(results[0])
    : call.role === "tool"
    ? (call.content?.replace(/\[(?:System|Harness)\]\s*/g, "").replace(/\s+/g, " ").slice(0, 100) ?? null)
    : null;

  return (
    <div className={harness ? "bg-muted/20" : undefined}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        {harness
          ? <Cpu className="w-3 h-3 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
          : <Wrench className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
        }
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            {harness && (
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40 font-medium">harness</span>
            )}
            <span className="text-xs font-mono text-foreground/75">{labels.join(", ")}</span>
          </div>
          {preview && !open && (
            <span className="text-[11px] text-muted-foreground block truncate">{preview}</span>
          )}
        </div>
        {open
          ? <ChevronDown className="w-3 h-3 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
        }
      </button>

      {open && (
        <div className="px-4 pb-3 ml-6 space-y-3">
          {/* Assistant thought */}
          {call.role === "assistant" && call.content && (
            <div className="text-xs text-foreground/70 leading-relaxed italic border-l-2 border-muted-foreground/20 pl-3">
              {call.content}
            </div>
          )}

          {/* Paired calls + results */}
          {calls.map((c, i) => {
            const result = results[i];
            const label = formatToolLabel(c.toolName ?? c.function?.name ?? "tool", c.args);
            return (
              <div key={i} className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground/70">{label}</p>
                {c.args != null && (
                  <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap overflow-auto max-h-36 rounded-lg bg-muted/40 p-2.5 leading-relaxed">
                    {JSON.stringify(c.args, null, 2)}
                  </pre>
                )}
                {result && (
                  <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap overflow-auto max-h-48 rounded-lg bg-muted/40 p-2.5 leading-relaxed">
                    {result.tool_result != null
                      ? (typeof result.tool_result === "string" ? result.tool_result : JSON.stringify(result.tool_result, null, 2))
                      : (result.content ?? "")}
                  </pre>
                )}
              </div>
            );
          })}

          {/* Standalone tool step (no preceding assistant calls) */}
          {call.role === "tool" && call.content && (
            <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap overflow-auto max-h-48 rounded-lg bg-muted/40 p-2.5 leading-relaxed">
              {call.content}
            </pre>
          )}

          {/* Unmatched results (safety) */}
          {results.length > calls.length && results.slice(calls.length).map(r => (
            <div key={r.id}>
              <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap overflow-auto max-h-48 rounded-lg bg-muted/40 p-2.5 leading-relaxed">
                {r.tool_result != null
                  ? (typeof r.tool_result === "string" ? r.tool_result : JSON.stringify(r.tool_result, null, 2))
                  : (r.content ?? "")}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageItem({ step }: { step: SessionStep }) {
  const [expanded, setExpanded] = useState(false);
  const text = step.content ?? "";

  if (step.role === "user") {
    return (
      <div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        >
          <span className="w-3 h-3 flex-shrink-0 rounded-full border border-border/60 bg-muted/50" />
          <span className="text-xs text-muted-foreground flex-1">Prompt</span>
          {expanded
            ? <ChevronDown className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
          }
        </button>
        {expanded && text && (
          <div className="px-4 pb-3 ml-6">
            <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap overflow-auto max-h-48 rounded-lg bg-muted/40 p-2.5 leading-relaxed">
              {text}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (step.role === "assistant" && text) {
    const isLong = text.length > 400;
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Bot className="w-3 h-3 text-muted-foreground/50" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Agent</span>
        </div>
        <p className={`text-xs text-foreground/80 leading-relaxed ${!expanded && isLong ? "line-clamp-5" : ""}`}>
          {text}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground mt-2 transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    );
  }

  return null;
}

interface SessionTraceProps {
  sessionId: number;
  totalCost?: number | null;
}

export default function SessionTrace({ sessionId, totalCost }: SessionTraceProps) {
  const { data: steps, isLoading } = useGetSessionSteps(sessionId, {
    query: { queryKey: getGetSessionStepsQueryKey(sessionId), enabled: !!sessionId },
  });

  const groups = steps ? groupSteps(steps) : [];
  const totalTok = steps?.reduce((s, st) => s + (st.tokens_used ?? 0), 0) ?? 0;
  const totalCostComputed = steps?.reduce((s, st) => s + (st.cost ?? 0), 0) ?? 0;
  const displayCost = formatCost(totalCostComputed || totalCost);

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 flex-shrink-0">
        <span className="text-xs font-medium">Agent Trace</span>
        <div className="flex items-center gap-2.5">
          {steps && steps.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{steps.length} steps</span>
          )}
          {displayCost && (
            <span className="text-[11px] text-muted-foreground">{displayCost}</span>
          )}
        </div>
      </div>

      {/* Scrollable feed */}
      <div className="overflow-y-auto flex-1 divide-y divide-border/25 min-h-0">
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
          groups.map((g, i) =>
            g.kind === "action"
              ? <ToolAction key={i} call={g.call} results={g.results} />
              : <MessageItem key={i} step={g.step} />
          )
        )}
      </div>

      {/* Footer */}
      {(totalTok > 0 || displayCost) && (
        <div className="border-t border-border/40 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          {totalTok > 0 && <span className="text-[10px] text-muted-foreground/60">{formatTokens(totalTok)}</span>}
          {displayCost && <span className="text-[10px] text-muted-foreground/60">{displayCost} total</span>}
        </div>
      )}
    </div>
  );
}
