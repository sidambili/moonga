import { Mail, HelpCircle } from "lucide-react";
import { FaGithub, FaSlack } from "react-icons/fa";
import { SiLinear, SiSentry } from "react-icons/si";
import { BetterStackIcon } from "@/components/icons/betterstack-icon";
import {
  formatSource,
  formatEventType,
  formatArtifactType,
  formatObjective,
  formatEventStatus,
  formatApprovalState,
  SEVERITY_LABELS,
  APPROVAL_STATE_LABELS,
  OBJECTIVE_COLORS,
} from "@workspace/constants";

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";

export { formatSource, formatEventType, formatArtifactType, formatObjective, formatEventStatus, formatApprovalState };

export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const normalized = source.toLowerCase();
  switch (normalized) {
    case "github": return <FaGithub className={className} />;
    case "linear": return <SiLinear className={className} />;
    case "sentry": return <SiSentry className={className} />;
    case "betterstack": return <BetterStackIcon className={className} />;
    case "slack": return <FaSlack className={className} />;
    case "email": return <Mail className={className} />;
    default: return <HelpCircle className={className} />;
  }
}

export function SeverityBadge({ severity }: { severity: string }) {
  const norm = severity.toLowerCase();
  const label = SEVERITY_LABELS[norm as keyof typeof SEVERITY_LABELS] || severity;
  if (norm === "critical") return <span className={`${badgeBase} bg-red-500/10 text-red-400`}>{label}</span>;
  if (norm === "high")     return <span className={`${badgeBase} bg-orange-500/10 text-orange-400`}>{label}</span>;
  if (norm === "medium")   return <span className={`${badgeBase} bg-yellow-500/10 text-yellow-400`}>{label}</span>;
  return <span className={`${badgeBase} bg-blue-500/10 text-blue-400`}>{label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const norm = status.toLowerCase();
  const label = status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

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
  return <span className={`${badgeBase} bg-muted text-muted-foreground`}>{formatArtifactType(type)}</span>;
}

export function ApprovalBadge({ state }: { state: string }) {
  const norm = state.toLowerCase();
  const label = APPROVAL_STATE_LABELS[norm as keyof typeof APPROVAL_STATE_LABELS] || state;
  if (norm === "draft")    return <span className={`${badgeBase} bg-yellow-500/10 text-yellow-400`}>{label}</span>;
  if (norm === "approved") return <span className={`${badgeBase} bg-emerald-500/10 text-emerald-400`}>{label}</span>;
  if (norm === "rejected") return <span className={`${badgeBase} bg-red-500/10 text-red-400`}>{label}</span>;
  if (norm === "edited")   return <span className={`${badgeBase} bg-primary/10 text-primary`}>{label}</span>;
  return <span className={`${badgeBase} bg-muted text-muted-foreground`}>{label}</span>;
}

export function ObjectivePill({ objective }: { objective: string }) {
  const cls = OBJECTIVE_COLORS[objective as keyof typeof OBJECTIVE_COLORS] ?? "bg-muted text-muted-foreground";
  return <span className={`${badgeBase} ${cls}`}>{formatObjective(objective)}</span>;
}
