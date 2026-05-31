import { GitBranch, Layers, AlertTriangle, Activity, MessageSquare, Mail, HelpCircle } from "lucide-react";

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";

export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const normalized = source.toLowerCase();
  switch (normalized) {
    case "github": return <GitBranch className={className} />;
    case "linear": return <Layers className={className} />;
    case "sentry": return <AlertTriangle className={className} />;
    case "betterstack": return <Activity className={className} />;
    case "slack": return <MessageSquare className={className} />;
    case "email": return <Mail className={className} />;
    default: return <HelpCircle className={className} />;
  }
}

export function SeverityBadge({ severity }: { severity: string }) {
  const norm = severity.toLowerCase();
  if (norm === "critical") return <span className={`${badgeBase} bg-red-500/10 text-red-400`}>Critical</span>;
  if (norm === "high")     return <span className={`${badgeBase} bg-orange-500/10 text-orange-400`}>High</span>;
  if (norm === "medium")   return <span className={`${badgeBase} bg-yellow-500/10 text-yellow-400`}>Medium</span>;
  return <span className={`${badgeBase} bg-blue-500/10 text-blue-400`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const norm = status.toLowerCase();
  const label = status.replace(/_/g, " ");

  if (["failed", "rejected", "error"].includes(norm))
    return <span className={`${badgeBase} bg-red-500/10 text-red-400`}>{label}</span>;
  if (["completed", "approved", "processed"].includes(norm))
    return <span className={`${badgeBase} bg-emerald-500/10 text-emerald-400`}>{label}</span>;
  if (["running", "processing"].includes(norm))
    return <span className={`${badgeBase} bg-primary/10 text-primary`}>{label}</span>;
  if (norm === "needs_review")
    return <span className={`${badgeBase} bg-orange-500/10 text-orange-400`}>{label}</span>;
  if (norm === "new")
    return <span className={`${badgeBase} bg-primary/10 text-primary`}>{label}</span>;

  return <span className={`${badgeBase} bg-muted text-muted-foreground`}>{label}</span>;
}

export function ArtifactTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    slack_message: "Slack",
    linear_ticket: "Linear",
    incident_report: "Incident",
    implementation_plan: "Plan",
  };
  return <span className={`${badgeBase} bg-muted text-muted-foreground`}>{labels[type] || type}</span>;
}

export function ApprovalBadge({ state }: { state: string }) {
  const norm = state.toLowerCase();
  if (norm === "draft")    return <span className={`${badgeBase} bg-yellow-500/10 text-yellow-400`}>Draft</span>;
  if (norm === "approved") return <span className={`${badgeBase} bg-emerald-500/10 text-emerald-400`}>Approved</span>;
  if (norm === "rejected") return <span className={`${badgeBase} bg-red-500/10 text-red-400`}>Rejected</span>;
  if (norm === "edited")   return <span className={`${badgeBase} bg-primary/10 text-primary`}>Edited</span>;
  return <span className={`${badgeBase} bg-muted text-muted-foreground`}>{state}</span>;
}

export function ObjectivePill({ objective }: { objective: string }) {
  const colors: Record<string, string> = {
    diagnose:  "bg-orange-500/10 text-orange-400",
    plan:      "bg-primary/10 text-primary",
    summarize: "bg-purple-500/10 text-purple-400",
    draft:     "bg-teal-500/10 text-teal-400",
  };
  const cls = colors[objective] ?? "bg-muted text-muted-foreground";
  return <span className={`${badgeBase} ${cls}`}>{objective}</span>;
}
