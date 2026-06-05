import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, Calendar, Users } from "lucide-react";
import { formatDate, formatRelative } from "@/lib/format";

// ── Linear payload types ──────────────────────────────────────────

interface LinearUser {
  id: string;
  url?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

interface LinearTeam {
  id: string;
  key?: string;
  name?: string;
}

interface LinearState {
  id: string;
  name: string;
  type: string;
  color?: string;
}

interface LinearLabel {
  id: string;
  name: string;
  color?: string;
}

interface LinearIssueData {
  id: string;
  url?: string;
  title?: string;
  identifier?: string;
  number?: number;
  description?: string;
  priority?: number;
  priorityLabel?: string;
  state?: LinearState;
  stateId?: string;
  team?: LinearTeam;
  teamId?: string;
  labels?: LinearLabel[];
  labelIds?: string[];
  assignee?: LinearUser | null;
  assigneeId?: string | null;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  creatorId?: string;
  descriptionData?: string;
}

interface LinearPayload {
  url?: string;
  data?: LinearIssueData;
  type?: string;
  action?: string;
  actor?: LinearUser;
  createdAt?: string;
  webhookId?: string;
  organizationId?: string;
}

// ── Shared helpers ────────────────────────────────────────────────

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

function UserRow({ user, label }: { user?: LinearUser | null; label: string }) {
  if (!user?.name) return null;
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 text-right">
        <Avatar className="h-5 w-5">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
          <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium truncate">{user.name}</span>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state?: LinearState }) {
  if (!state) return null;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: state.color ? `${state.color}20` : undefined,
        color: state.color || undefined,
      }}
    >
      {state.name}
    </span>
  );
}

function LabelBadge({ label }: { label: LinearLabel }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: label.color ? `${label.color}20` : undefined,
        color: label.color || undefined,
      }}
    >
      {label.name}
    </span>
  );
}

function PriorityBadge({ priority, label }: { priority?: number; label?: string }) {
  if (priority == null) return null;
  const colors: Record<number, string> = {
    0: "bg-muted text-muted-foreground",
    1: "bg-blue-500/10 text-blue-400",
    2: "bg-orange-500/10 text-orange-400",
    3: "bg-red-500/10 text-red-400",
    4: "bg-red-500/15 text-red-500",
  };
  const cls = colors[priority] ?? colors[1];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label ?? `Priority ${priority}`}</span>;
}

// ── Linear renderer ─────────────────────────────────────────────

function LinearEventRenderer({ payload }: { payload: Record<string, unknown> }) {
  const p = payload as unknown as LinearPayload;
  const data = p.data;
  const actor = p.actor;

  const externalUrl = data?.url ?? p.url;
  const identifier = data?.identifier;
  const title = data?.title;

  return (
    <div className="space-y-3">
      {/* Ticket identity & link */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Ticket</span>
            {identifier && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums font-mono">
                {identifier}
              </span>
            )}
          </div>
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Linear
            </a>
          )}
        </div>
        <div className="p-4 space-y-3">
          {title && <p className="text-sm font-medium leading-snug">{title}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={data?.state} />
            <PriorityBadge priority={data?.priority} label={data?.priorityLabel} />
            {data?.labels?.map((label) => <LabelBadge key={label.id} label={label} />)}
          </div>

          {data?.description && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{data.description}</p>
          )}
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Issue details */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Issue Details</p>
          <div className="space-y-2">
            {data?.team?.name && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Team</span>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-medium">
                    {data.team.name}
                    {data.team.key && <span className="text-muted-foreground font-normal ml-1">({data.team.key})</span>}
                  </span>
                </div>
              </div>
            )}
            {data?.number != null && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Number</span>
                <span className="text-xs font-medium tabular-nums">#{data.number}</span>
              </div>
            )}
            {data?.dueDate && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Due Date</span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-medium">{data.dueDate}</span>
                </div>
              </div>
            )}
            {data?.createdAt && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Created</span>
                <span className="text-xs font-medium">{formatDate(data.createdAt)}</span>
              </div>
            )}
            {data?.updatedAt && data.updatedAt !== data.createdAt && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Updated</span>
                <span className="text-xs font-medium">{formatDate(data.updatedAt)}</span>
              </div>
            )}
            {p.action && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">Action</span>
                <span className="text-xs font-medium capitalize">{p.action}</span>
              </div>
            )}
          </div>
        </div>

        {/* People */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">People</p>
          <div className="space-y-2">
            <UserRow user={data?.assignee} label="Assignee" />
            <UserRow user={actor} label="Triggered By" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fallback renderer ───────────────────────────────────────────

function FallbackPayloadRenderer() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">No structured view available for this source.</p>
    </div>
  );
}

// ── Main switch ─────────────────────────────────────────────────

export function EventPayloadRenderer({
  source,
  payload,
}: {
  source: string;
  payload: Record<string, unknown>;
}) {
  const normalized = source.toLowerCase();

  if (normalized === "linear") {
    return <LinearEventRenderer payload={payload} />;
  }

  return <FallbackPayloadRenderer />;
}
