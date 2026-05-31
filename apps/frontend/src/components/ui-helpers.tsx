import { Mail, HelpCircle } from "lucide-react";
import { FaGithub, FaSlack } from "react-icons/fa";
import { SiLinear, SiSentry } from "react-icons/si";
import { BetterStackIcon } from "@/components/icons/betterstack-icon";

const badgeBase = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";

export function formatEventType(type: string): string {
  const map: Record<string, string> = {
    ticket_created: "Ticket created",
    issue_opened: "Issue opened",
    issue_updated: "Issue updated",
    pr_opened: "PR opened",
    pr_merged: "PR merged",
    pr_closed: "PR closed",
    push: "Push",
  };
  return map[type] || type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatSource(source: string): string {
  const map: Record<string, string> = {
    github: "GitHub",
    linear: "Linear",
    sentry: "Sentry",
    betterstack: "Better Stack",
    slack: "Slack",
    email: "Email",
  };
  return map[source.toLowerCase()] || source.replace(/^\w/, (c) => c.toUpperCase());
}

export function formatArtifactType(type: string): string {
  const map: Record<string, string> = {
    action_plan: "Action plan",
    diagnosis: "Diagnosis",
    slack_message: "Slack message",
    linear_ticket: "Linear ticket",
    incident_report: "Incident report",
    implementation_plan: "Implementation plan",
  };
  return map[type] || type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatObjective(objective: string): string {
  const map: Record<string, string> = {
    diagnose: "Diagnose",
    plan: "Plan",
    summarize: "Summarize",
    draft: "Draft",
  };
  return map[objective] || objective.replace(/^\w/, (c) => c.toUpperCase());
}

export function formatEventStatus(status: string): string {
  const map: Record<string, string> = {
    new: "New",
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
  };
  return map[status] || status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

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
  if (norm === "critical") return <span className={`${badgeBase} bg-red-500/10 text-red-400`}>Critical</span>;
  if (norm === "high")     return <span className={`${badgeBase} bg-orange-500/10 text-orange-400`}>High</span>;
  if (norm === "medium")   return <span className={`${badgeBase} bg-yellow-500/10 text-yellow-400`}>Medium</span>;
  return <span className={`${badgeBase} bg-blue-500/10 text-blue-400`}>{severity}</span>;
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

export function formatApprovalState(state: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    approved: "Approved",
    rejected: "Rejected",
    edited: "Edited",
  };
  return map[state.toLowerCase()] || state.replace(/^\w/, (c) => c.toUpperCase());
}

export function ApprovalBadge({ state }: { state: string }) {
  const norm = state.toLowerCase();
  const label = formatApprovalState(state);
  if (norm === "draft")    return <span className={`${badgeBase} bg-yellow-500/10 text-yellow-400`}>{label}</span>;
  if (norm === "approved") return <span className={`${badgeBase} bg-emerald-500/10 text-emerald-400`}>{label}</span>;
  if (norm === "rejected") return <span className={`${badgeBase} bg-red-500/10 text-red-400`}>{label}</span>;
  if (norm === "edited")   return <span className={`${badgeBase} bg-primary/10 text-primary`}>{label}</span>;
  return <span className={`${badgeBase} bg-muted text-muted-foreground`}>{label}</span>;
}

export function ObjectivePill({ objective }: { objective: string }) {
  const colors: Record<string, string> = {
    diagnose:  "bg-orange-500/10 text-orange-400",
    plan:      "bg-primary/10 text-primary",
    summarize: "bg-purple-500/10 text-purple-400",
    draft:     "bg-teal-500/10 text-teal-400",
  };
  const cls = colors[objective] ?? "bg-muted text-muted-foreground";
  return <span className={`${badgeBase} ${cls}`}>{formatObjective(objective)}</span>;
}
