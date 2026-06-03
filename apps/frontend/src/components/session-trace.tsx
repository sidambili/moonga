import { useState, useEffect, useRef } from "react";
import type { SessionStep } from "@workspace/api-client-react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Brain,
  Search,
  FileText,
  FolderOpen,
  GitCommit,
  GitPullRequest,
  CircleDot,
  History,
  Terminal,
  User,
  FileOutput,
  MessageSquare,
  Download,
  BookOpen,
  Wrench,
  Sparkles,
  Clock,
  Coins,
} from "lucide-react";
import { SYSTEM_TOOL_NAMES, getToolLabel } from "@workspace/constants";
import Markdown from "@/components/markdown";

function formatCost(cost: number | null | undefined) {
  if (cost == null || cost === 0) return null;
  if (cost < 0.001) return "<$0.001";
  return `$${cost.toFixed(4)}`;
}

function formatTokens(n: number | null | undefined) {
  if (n == null || n === 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function formatTokenPair(
  prompt: number | null | undefined,
  completion: number | null | undefined,
) {
  const p = prompt ?? 0;
  const c = completion ?? 0;
  if (p === 0 && c === 0) return null;
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
  return `${fmt(p)}↑ ${fmt(c)}↓`;
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

function extractBalancedJson(text: string): string | null {
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escape) { escape = false; continue; }
    if (char === "\\") { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === "{") { if (depth === 0) start = i; depth++; }
      else if (char === "}") { depth--; if (depth === 0 && start !== -1) return text.slice(start, i + 1); }
    }
  }
  return null;
}

function repairJsonStringValues(json: string): string {
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (escape) { result += char; escape = false; continue; }
    if (char === "\\") { result += char; escape = true; continue; }
    if (char === '"') { inString = !inString; result += char; continue; }
    if (inString && (char === "\n" || char === "\r")) { result += "\\n"; continue; }
    result += char;
  }
  return result;
}

function tryParseArtifactOutput(text: string | null | undefined): ArtifactOutput | null {
  if (!text) return null;
  const stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  const balanced = extractBalancedJson(stripped);
  if (balanced) {
    try {
      const repaired = repairJsonStringValues(balanced);
      const p = JSON.parse(repaired) as Record<string, unknown>;
      if (typeof p.content === "string" && p.content.trim() && (typeof p.summary === "string" || typeof p.slack_summary === "string")) {
        return {
          content: p.content,
          summary: (p.summary ?? p.slack_summary) as string,
          confidence: typeof p.confidence === "number" ? p.confidence : undefined,
        };
      }
    } catch { /* not parseable */ }
  }

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const repaired = repairJsonStringValues(stripped.slice(start, end + 1));
      const p = JSON.parse(repaired) as Record<string, unknown>;
      if (typeof p.content === "string" && p.content.trim() && (typeof p.summary === "string" || typeof p.slack_summary === "string")) {
        return {
          content: p.content,
          summary: (p.summary ?? p.slack_summary) as string,
          confidence: typeof p.confidence === "number" ? p.confidence : undefined,
        };
      }
    } catch { /* not parseable */ }
  }

  return null;
}

type VisualGroup =
  | { kind: "thinking"; step: SessionStep; durationMs?: number }
  | { kind: "tool_group"; call: SessionStep; items: ToolCallItem[]; isSystem: boolean }
  | { kind: "user"; step: SessionStep }
  | { kind: "artifact_output"; step: SessionStep; parsed: ArtifactOutput };

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function toolGroupSummary(items: ToolCallItem[]): string {
  if (items.length === 0) return "Tool call";
  const first = getToolLabel(items[0].name, items[0].args);
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

/* ── Icon mapping ─────────────────────────────────────────── */

function getToolIcon(name: string) {
  switch (name) {
    case "search_code": return Search;
    case "get_file_contents": return FileText;
    case "list_directory": return FolderOpen;
    case "get_commit_diff": return GitCommit;
    case "get_pull_request": return GitPullRequest;
    case "get_issue": return CircleDot;
    case "get_recent_commits": return History;
    case "create_artifact": return FileOutput;
    case "post_linear_comment":
    case "post_slack_reply": return MessageSquare;
    case "gather_event_context": return Download;
    case "fetch_repo_instructions": return BookOpen;
    default: return Wrench;
  }
}

function StepIcon({ name, className }: { name: string; className?: string }) {
  const Icon = getToolIcon(name);
  return <Icon className={className} />;
}

/* ── Rows ───────────────────────────────────────────────── */

function ArtifactOutputRow({ step, parsed }: { step: SessionStep; parsed: ArtifactOutput }) {
  const [open, setOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const confidencePct = parsed.confidence != null ? `${Math.round(parsed.confidence * 100)}%` : null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-2 hover:bg-muted/10 transition-colors text-left"
      >
        <FileOutput className="w-4 h-4 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
        <span className="text-[13px] text-foreground/80 flex-1 min-w-0 truncate">Created summary</span>
        {confidencePct && (
          <span className="text-[10px] tabular-nums text-muted-foreground/45 ml-2 flex-shrink-0">
            {confidencePct} confidence
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
        )}
      </button>
      {open && (
        <div className="pb-2 space-y-1">
          <div className="px-4 pl-11 pb-1.5">
            <p className="text-[13px] text-muted-foreground/70 leading-relaxed">{parsed.summary}</p>
          </div>
          <div>
            <button
              onClick={() => setShowFull((v) => !v)}
              className="w-full flex items-center gap-1.5 py-1.5 pl-11 pr-4 hover:bg-muted/10 transition-colors text-left"
            >
              {showFull ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
              )}
              <span className="text-[11px] text-muted-foreground/60">Show full content</span>
            </button>
            {showFull && (
              <div className="px-4 pb-2 pl-14">
                <pre className="text-[11px] font-mono text-muted-foreground/60 whitespace-pre-wrap overflow-auto max-h-64 rounded bg-muted/30 p-2 leading-relaxed">
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
  const label = getToolLabel(item.name, item.args);
  const hasDetail = item.args != null || item.result != null;
  const toolResult = item.result?.tool_result;
  const failed =
    typeof toolResult === "object" &&
    toolResult !== null &&
    (toolResult as Record<string, unknown>).success === false;

  const Icon = getToolIcon(item.name);

  if (!hasDetail) {
    return (
      <div className="flex items-start gap-2.5 py-1.5 pl-11 pr-4">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
        <span className={`text-[12px] ${failed ? "text-destructive" : "text-muted-foreground/60"}`}>{label}</span>
        {failed && (
          <span className="text-[9px] uppercase tracking-wider bg-destructive/10 text-destructive font-medium px-1.5 py-0.5 rounded">
            failed
          </span>
        )}
      </div>
    );
  }

  const resultText =
    toolResult != null
      ? typeof toolResult === "string"
        ? toolResult
        : typeof toolResult === "object" &&
          toolResult !== null &&
          typeof (toolResult as Record<string, unknown>).error === "string"
        ? (toolResult as Record<string, string>).error
        : JSON.stringify(toolResult, null, 2)
      : (item.result?.content ?? "");

  // File reads: show path badge style like Devin
  const isFileRead = item.name === "get_file_contents" && item.args && typeof item.args === "object";
  const filePath = isFileRead ? String((item.args as Record<string, unknown>).path ?? "") : "";
  const fileRange = isFileRead && item.result?.content
    ? (() => {
        const content = String(item.result.content);
        // Try to extract line numbers from context
        const lines = content.split("\n");
        if (lines.length > 0) {
          return `${lines.length} lines`;
        }
        return null;
      })()
    : null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2.5 py-1.5 pl-11 pr-4 hover:bg-muted/10 transition-colors text-left"
      >
        <Icon className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
        {isFileRead ? (
          <span className="text-[12px] text-muted-foreground/70">
            Read <code className="bg-muted/50 px-1 py-0.5 rounded text-[11px] font-mono">{basename(filePath)}</code>
            {fileRange && <span className="text-muted-foreground/40 ml-1">{fileRange}</span>}
          </span>
        ) : (
          <span className={`text-[12px] ${failed ? "text-destructive" : "text-muted-foreground/70"}`}>{label}</span>
        )}
        {failed && (
          <span className="text-[9px] uppercase tracking-wider bg-destructive/10 text-destructive font-medium px-1.5 py-0.5 rounded ml-1">
            failed
          </span>
        )}
        {hasDetail && (
          open ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/25 flex-shrink-0 mt-0.5 ml-auto" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/25 flex-shrink-0 mt-0.5 ml-auto" />
          )
        )}
      </button>
      {open && (
        <div className="px-4 pb-2 pl-16 space-y-1.5">
          {item.args != null && (
            <pre className="text-[11px] font-mono text-muted-foreground/60 whitespace-pre-wrap overflow-auto max-h-32 rounded bg-muted/30 p-2 leading-relaxed">
              {JSON.stringify(item.args, null, 2)}
            </pre>
          )}
          {resultText && (
            <pre className="text-[11px] font-mono text-muted-foreground/60 whitespace-pre-wrap overflow-auto max-h-40 rounded bg-muted/30 p-2 leading-relaxed">
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
  const tok = formatTokenPair(step.prompt_tokens, step.completion_tokens);
  const hasContent = !!step.content && step.content.trim().length > 0;

  return (
    <div>
      <button
        onClick={() => hasContent && setOpen((v) => !v)}
        className={`w-full flex items-start gap-3 px-4 py-1.5 transition-colors text-left ${hasContent ? "hover:bg-muted/10 cursor-pointer" : ""}`}
      >
        <Brain className="w-4 h-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
        <span className="text-[13px] text-foreground/80 flex-1 min-w-0">
          Thought
          {durationMs != null && (
            <span className="text-muted-foreground/40"> for {formatDuration(durationMs)}</span>
          )}
        </span>
        {tok && (
          <span className="text-[10px] tabular-nums text-muted-foreground/35 ml-2 flex-shrink-0">
            {tok}
          </span>
        )}
        {hasContent && (
          open ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0 mt-0.5" />
          )
        )}
      </button>
      {open && hasContent && (
        <div className="px-4 pb-3 pl-11">
          <div className="text-[13px] text-muted-foreground/70 leading-relaxed max-h-64 overflow-y-auto">
            <Markdown className="prose-p:text-muted-foreground/70 prose-strong:text-muted-foreground/70 prose-li:text-muted-foreground/70">{step.content ?? ""}</Markdown>
          </div>
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
  const tok = formatTokenPair(call.prompt_tokens, call.completion_tokens);
  const MainIcon = items.length > 0 ? getToolIcon(items[0].name) : Wrench;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-2 hover:bg-muted/10 transition-colors text-left"
      >
        <MainIcon className="w-4 h-4 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
        <span className="text-[13px] flex-1 min-w-0 truncate text-foreground/80">
          {summary}
        </span>
        {tok && (
          <span className="text-[10px] tabular-nums text-muted-foreground/35 ml-2 flex-shrink-0">
            {tok}
          </span>
        )}
        {isSystem && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/25 font-medium ml-2 flex-shrink-0">
            system
          </span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0 mt-0.5" />
        )}
      </button>
      {open && (
        <div className="pb-1">
          {call.role === "assistant" && call.content && (
            <div className="px-4 pb-2 pl-11">
              <div className="text-[12px] text-muted-foreground/60 leading-relaxed">
                <Markdown className="prose-p:text-muted-foreground/50 prose-strong:text-muted-foreground/50 prose-li:text-muted-foreground/50">{call.content}</Markdown>
              </div>
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
        className="w-full flex items-start gap-3 px-4 py-1.5 hover:bg-muted/10 transition-colors text-left"
      >
        <User className="w-4 h-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
        <span className="text-[13px] text-foreground/80 flex-1 min-w-0">Instructions</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 flex-shrink-0 mt-0.5" />
        )}
      </button>
      {open && step.content && (
        <div className="px-4 pb-2 pl-11">
          <pre className="text-[12px] font-mono text-muted-foreground/60 whitespace-pre-wrap overflow-auto max-h-48 rounded bg-muted/30 p-2 leading-relaxed">
            {step.content}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────── */

interface SessionTraceProps {
  sessionId: number;
  totalCost?: number | null;
  durationMs?: number | null;
}

export default function SessionTrace({ sessionId, totalCost, durationMs }: SessionTraceProps) {
  const [steps, setSteps] = useState<SessionStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoading(true);
    setSteps([]);
    setIsLive(false);

    // 1. Load initial steps via REST
    fetch(`/api/sessions/${sessionId}/steps`)
      .then((r) => r.json())
      .then((data: SessionStep[]) => {
        setSteps(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });

    // 2. Open SSE for live updates
    const es = new EventSource(`/api/sessions/${sessionId}/stream`);
    es.onmessage = (e) => {
      try {
        const step = JSON.parse(e.data) as SessionStep;
        setSteps((prev) => {
          if (prev.some((s) => s.id === step.id)) return prev;
          return [...prev, step].sort((a, b) => a.step_number - b.step_number);
        });
        setIsLive(true);
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => {
      setIsLive(false);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [sessionId]);

  // Auto-scroll to bottom when new steps arrive while live
  useEffect(() => {
    if (isLive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps, isLive]);

  const groups = steps ? buildVisualGroups(steps) : [];
  const totalTok = steps?.reduce((s, st) => s + (st.tokens_used ?? 0), 0) ?? 0;
  const totalPrompt = steps?.reduce((s, st) => s + (st.prompt_tokens ?? 0), 0) ?? 0;
  const totalCompletion = steps?.reduce((s, st) => s + (st.completion_tokens ?? 0), 0) ?? 0;
  const totalCostComputed = steps?.reduce((s, st) => s + (st.cost ?? 0), 0) ?? 0;
  const displayCost = formatCost(totalCostComputed || totalCost);
  const displayTok = formatTokenPair(totalPrompt, totalCompletion) ?? formatTokens(totalTok);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Agent Trace</span>
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {steps && steps.length > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {steps.length} steps
            </span>
          )}
          {durationMs != null && durationMs > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(durationMs)}
            </span>
          )}
          {displayTok && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {displayTok}
            </span>
          )}
          {displayCost && (
            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
              <Coins className="w-3 h-3" />
              {displayCost}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable feed */}
      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0">
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
    </div>
  );
}
