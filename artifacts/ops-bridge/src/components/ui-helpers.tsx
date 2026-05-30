import { GitBranch, Layers, AlertTriangle, Activity, MessageSquare, Mail, HelpCircle } from "lucide-react";

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
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (norm === "critical") return <span className={`${base} bg-red-500/10 text-red-400`}>Critical</span>;
  if (norm === "high")     return <span className={`${base} bg-orange-500/10 text-orange-400`}>High</span>;
  if (norm === "medium")   return <span className={`${base} bg-yellow-500/10 text-yellow-400`}>Medium</span>;
  return <span className={`${base} bg-blue-500/10 text-blue-400`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const norm = status.toLowerCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  const label = status.replace(/_/g, " ");

  if (["failed", "rejected", "error"].includes(norm))
    return <span className={`${base} bg-red-500/10 text-red-400`}>{label}</span>;
  if (["completed", "approved", "processed"].includes(norm))
    return <span className={`${base} bg-emerald-500/10 text-emerald-400`}>{label}</span>;
  if (["running", "processing"].includes(norm))
    return <span className={`${base} bg-primary/10 text-primary`}>{label}</span>;
  if (norm === "needs_review")
    return <span className={`${base} bg-orange-500/10 text-orange-400`}>{label}</span>;
  if (norm === "new")
    return <span className={`${base} bg-primary/10 text-primary`}>{label}</span>;

  return <span className={`${base} bg-muted text-muted-foreground`}>{label}</span>;
}
