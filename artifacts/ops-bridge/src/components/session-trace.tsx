import { useState } from "react";
import { useGetSessionSteps, getGetSessionStepsQueryKey } from "@workspace/api-client-react";
import type { SessionStep } from "@workspace/api-client-react";
import { ChevronDown, ChevronRight, Wrench, Bot, User, Loader2 } from "lucide-react";

function formatCost(cost: number | null | undefined): string | null {
  if (cost == null || cost === 0) return null;
  if (cost < 0.001) return `<$0.001`;
  return `$${cost.toFixed(4)}`;
}

function formatTokens(n: number | null | undefined): string | null {
  if (n == null || n === 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function StepCard({ step }: { step: SessionStep }) {
  const [open, setOpen] = useState(false);

  const isInitialPrompt = step.role === "user" && step.step_number === 0;
  const isContextTool = step.role === "tool" && step.tool_name === "gather_event_context";
  const defaultCollapsed = isInitialPrompt || isContextTool;

  const [expanded, setExpanded] = useState(!defaultCollapsed);

  const tokens = formatTokens(step.tokens_used);
  const cost = formatCost(step.cost);

  let icon = <User className="w-3 h-3" />;
  let headerLabel = "Prompt";
  let headerCls = "text-muted-foreground";
  let borderCls = "border-border/40";

  if (step.role === "assistant") {
    icon = <Bot className="w-3 h-3" />;
    if (step.tool_calls && (step.tool_calls as unknown[]).length > 0) {
      const calls = step.tool_calls as Array<{ toolName?: string; function?: { name: string } }>;
      const names = calls.map(c => c.toolName ?? c.function?.name ?? "tool").join(", ");
      headerLabel = `Calling: ${names}`;
      headerCls = "text-blue-400";
      borderCls = "border-blue-500/20";
    } else {
      headerLabel = "Model reasoning";
      headerCls = "text-emerald-400";
      borderCls = "border-emerald-500/20";
    }
  } else if (step.role === "tool") {
    icon = <Wrench className="w-3 h-3" />;
    headerLabel = step.tool_name ?? "Tool result";
    headerCls = "text-purple-400";
    borderCls = "border-purple-500/20";
  }

  const hasContent = !!(
    step.content ||
    (step.tool_calls && (step.tool_calls as unknown[]).length > 0) ||
    step.tool_result
  );

  return (
    <div className={`rounded-lg border ${borderCls} bg-card overflow-hidden`}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
        disabled={!hasContent}
      >
        <span className={`flex-shrink-0 ${headerCls}`}>{icon}</span>
        <span className={`text-[11px] font-medium flex-1 ${headerCls}`}>
          {headerLabel}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {tokens && <span className="text-[10px] text-muted-foreground/60">{tokens} tok</span>}
          {cost && <span className="text-[10px] text-muted-foreground/60">{cost}</span>}
          {hasContent && (
            expanded
              ? <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
          )}
        </div>
      </button>

      {expanded && hasContent && (
        <div className="px-3 pb-3 border-t border-border/30">
          {step.content && (
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed mt-2 max-h-64 overflow-auto">
              {step.content}
            </pre>
          )}
          {step.tool_calls && (step.tool_calls as unknown[]).length > 0 && (
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed mt-2 max-h-48 overflow-auto">
              {JSON.stringify(step.tool_calls, null, 2)}
            </pre>
          )}
          {step.tool_result && (
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed mt-2 max-h-48 overflow-auto">
              {JSON.stringify(step.tool_result, null, 2)}
            </pre>
          )}
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
  const [panelOpen, setPanelOpen] = useState(false);
  const { data: steps, isLoading } = useGetSessionSteps(sessionId, {
    query: { queryKey: getGetSessionStepsQueryKey(sessionId), enabled: panelOpen && !!sessionId },
  });

  const stepCount = steps?.length ?? 0;
  const costDisplay = formatCost(totalCost);

  return (
    <div className="rounded-xl bg-card border border-border/60 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors"
        onClick={() => setPanelOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Reasoning Trace</span>
          {stepCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {stepCount} steps
            </span>
          )}
          {costDisplay && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {costDisplay}
            </span>
          )}
        </div>
        {panelOpen
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
        }
      </button>

      {panelOpen && (
        <div className="px-4 pb-4 border-t border-border/30 space-y-2 pt-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading trace…
            </div>
          ) : !steps || steps.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No steps recorded.</p>
          ) : (
            <>
              {steps.map(step => <StepCard key={step.id} step={step} />)}
              {/* Cost footer */}
              {(() => {
                const totalTok = steps.reduce((s, st) => s + (st.tokens_used ?? 0), 0);
                const totalCostSum = steps.reduce((s, st) => s + (st.cost ?? 0), 0);
                return (totalTok > 0 || totalCostSum > 0) ? (
                  <div className="flex justify-end gap-3 pt-1 text-[10px] text-muted-foreground/60">
                    {totalTok > 0 && <span>Total: {formatTokens(totalTok)} tokens</span>}
                    {totalCostSum > 0 && <span>{formatCost(totalCostSum)}</span>}
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
