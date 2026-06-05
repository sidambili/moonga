// ============================================================
// Pagination
// ============================================================
export const DEFAULT_PAGE_SIZE = 50;

// ============================================================
// Sources
// ============================================================
export const SOURCE_IDS = ["github", "linear", "sentry", "betterstack", "slack", "email"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_LABELS: Record<SourceId, string> = {
  github: "GitHub",
  linear: "Linear",
  sentry: "Sentry",
  betterstack: "Better Stack",
  slack: "Slack",
  email: "Email",
};

export const SOURCE_COLORS: Record<SourceId, string> = {
  github: "#6b7280",
  linear: "#8b5cf6",
  sentry: "#ef4444",
  betterstack: "#f97316",
  slack: "#3b82f6",
  email: "#10b981",
};

// ============================================================
// Severities
// ============================================================
export const SEVERITY_LEVELS = ["critical", "high", "medium", "low"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

// ============================================================
// Event Statuses
// ============================================================
// Mirrors the values actually written by the pipeline: webhook ingest → processing,
// agent run → needs_review, then a terminal resolved/closed. ("open"/"in_progress"
// were never written.)
export const EVENT_STATUSES = ["new", "processing", "needs_review", "resolved", "closed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  new: "New",
  processing: "Processing",
  needs_review: "Needs review",
  resolved: "Resolved",
  closed: "Closed",
};

// Why a terminal-status event reached its end state.
export const EVENT_RESOLUTIONS = ["resolved", "duplicate", "wont_fix", "escalated"] as const;
export type EventResolution = (typeof EVENT_RESOLUTIONS)[number];

export const EVENT_RESOLUTION_LABELS: Record<EventResolution, string> = {
  resolved: "Resolved",
  duplicate: "Duplicate",
  wont_fix: "Won't fix",
  escalated: "Escalated",
};

export function formatEventResolution(resolution: string): string {
  return EVENT_RESOLUTION_LABELS[resolution as EventResolution] || resolution.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ============================================================
// Session Statuses
// ============================================================
export const SESSION_STATUSES = [
  "pending",
  "running",
  "needs_review",
  "approved",
  "rejected",
  "completed",
  "failed",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  pending: "Pending",
  running: "Running",
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  failed: "Failed",
};

// ============================================================
// Event Types
// ============================================================
export const EVENT_TYPES = [
  "ticket_created",
  "issue_opened",
  "issue_updated",
  "pr_opened",
  "pr_merged",
  "pr_closed",
  "push",
  "error",
  "anomaly",
  "ticket_updated",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  ticket_created: "Ticket created",
  issue_opened: "Issue opened",
  issue_updated: "Issue updated",
  pr_opened: "PR opened",
  pr_merged: "PR merged",
  pr_closed: "PR closed",
  push: "Push",
  error: "Error",
  anomaly: "Anomaly",
  ticket_updated: "Ticket updated",
};

export const GITHUB_EVENT_TYPE_MAP: Record<string, string> = {
  issues: "issues",
  pull_request: "pull_requests",
  release: "releases",
};

export const GITHUB_EVENT_TYPE_OPTIONS = [
  { key: "issues" as const, label: "Issues" },
  { key: "pull_requests" as const, label: "Pull Requests" },
  { key: "releases" as const, label: "Releases" },
];

// ============================================================
// Artifact Types
// ============================================================
export const ARTIFACT_TYPES = [
  "action_plan",
  "diagnosis",
  "slack_message",
  "linear_ticket",
  "incident_report",
  "implementation_plan",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  action_plan: "Action plan",
  diagnosis: "Diagnosis",
  slack_message: "Slack message",
  linear_ticket: "Linear ticket",
  incident_report: "Incident report",
  implementation_plan: "Implementation plan",
};

// ============================================================
// Objectives
// ============================================================
export const OBJECTIVES = ["triage", "diagnose", "plan", "summarize", "draft"] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  triage: "Triage",
  diagnose: "Diagnose",
  plan: "Plan",
  summarize: "Summarize",
  draft: "Draft",
};

export const OBJECTIVE_COLORS: Record<Objective, string> = {
  triage: "bg-green-500/10 text-green-400",
  diagnose: "bg-orange-500/10 text-orange-400",
  plan: "bg-primary/10 text-primary",
  summarize: "bg-purple-500/10 text-purple-400",
  draft: "bg-teal-500/10 text-teal-400",
};

// ============================================================
// Approval States
// ============================================================
export const APPROVAL_STATES = ["draft", "approved", "rejected", "edited"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const APPROVAL_STATE_LABELS: Record<ApprovalState, string> = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Rejected",
  edited: "Edited",
};

// ============================================================
// Integration Providers
// ============================================================
export const INTEGRATION_PROVIDERS = [
  {
    id: "github",
    label: "GitHub",
    description: "Webhook events & codebase access",
  },
  {
    id: "linear",
    label: "Linear",
    description: "Ticket creation, status changes, comments",
  },
  {
    id: "sentry",
    label: "Sentry",
    description: "Error events, issue alerts, performance issues",
  },
  {
    id: "betterstack",
    label: "Better Stack",
    description: "Uptime monitors, incident alerts, log anomalies",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Message events, slash commands, approvals",
  },
  {
    id: "email",
    label: "Email",
    description: "Notification delivery for approvals and summaries",
  },
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

// ============================================================
// Model Providers
// ============================================================
export const MODEL_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "custom", label: "Custom (OpenAI-compatible)" },
] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const MODEL_SUGGESTIONS: Record<string, { triage: string[]; plan: string[] }> = {
  openai: {
    triage: ["gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.5"],
    plan: ["gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.5"],
  },
  anthropic: {
    triage: ["claude-sonnet-4-6"],
    plan: ["claude-opus-4-8", "claude-sonnet-4-6"],
  },
  openrouter: {
    triage: ["qwen/qwen3.7-max", "google/gemini-3.5-flash", "deepseek/deepseek-v4-flash"],
    plan: ["deepseek/deepseek-v4-pro", "moonshotai/kimi-k2.6"],
  },
  custom: { triage: ["your-triage-model"], plan: ["your-plan-model"] },
};

// ============================================================
// Routing Modes
// ============================================================
export const ROUTING_MODES = [
  {
    tag: "Triage",
    desc: "Initial classification, severity scoring, and Slack summaries. Uses the faster, cheaper model.",
  },
  {
    tag: "Plan",
    desc: "Deep diagnosis, implementation planning, and incident reports. Uses the more capable model.",
  },
] as const;

// ============================================================
// Tools
// ============================================================
export const SYSTEM_TOOL_NAMES = new Set([
  "create_artifact",
  "post_linear_comment",
  "post_slack_reply",
  "gather_event_context",
  "fetch_repo_instructions",
  "critic_review",
  "delegate_plan",
]);

export function getToolLabel(name: string, args?: unknown): string {
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
    case "search_linear_issues": {
      const q = a.query ? String(a.query) : "";
      return q ? `Searched Linear: ${q.includes(" ") ? `"${q}"` : q}` : "Searched Linear issues";
    }
    case "get_linear_issue":
      return a.id ? `Linear issue ${String(a.id).slice(0, 8)}` : "Linear issue";
    case "search_existing_artifacts": {
      const q = a.query ? String(a.query) : "";
      return q ? `Searched artifacts: ${q.includes(" ") ? `"${q}"` : q}` : "Searched artifacts";
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
    case "critic_review":
      return "Plan review";
    case "delegate_plan":
      return "Triage recommendation";
    default:
      return name.replace(/_/g, " ");
  }
}

// ============================================================
// Format helpers
// ============================================================
export function formatSource(source: string): string {
  return SOURCE_LABELS[source.toLowerCase() as SourceId] || source.replace(/^\w/, (c) => c.toUpperCase());
}

export function formatEventType(type: string): string {
  return EVENT_TYPE_LABELS[type as EventType] || type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatArtifactType(type: string): string {
  return ARTIFACT_TYPE_LABELS[type as ArtifactType] || type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatObjective(objective: string): string {
  return OBJECTIVE_LABELS[objective as Objective] || objective.replace(/^\w/, (c) => c.toUpperCase());
}

export function formatEventStatus(status: string): string {
  return EVENT_STATUS_LABELS[status as EventStatus] || status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatSessionStatus(status: string): string {
  return SESSION_STATUS_LABELS[status as SessionStatus] || status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function formatApprovalState(state: string): string {
  return APPROVAL_STATE_LABELS[state.toLowerCase() as ApprovalState] || state.replace(/^\w/, (c) => c.toUpperCase());
}
