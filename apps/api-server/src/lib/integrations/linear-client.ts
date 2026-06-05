import { LinearClient } from "@linear/sdk";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

export function extractLinearTicketInfo(payload: Record<string, unknown>): string {
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return JSON.stringify(payload, null, 2).slice(0, 2_000);

  const priorityLabel: Record<number, string> = { 0: "No priority", 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };
  const labels = (data.labels as Array<{ name: string }> | undefined)?.map((l) => l.name).join(", ") || "None";
  const assignee = (data.assignee as { name?: string } | undefined)?.name || "Unassigned";
  const state = (data.state as { name?: string } | undefined)?.name || "Unknown";
  const description = (data.description as string | undefined) || "";

  const lines = [
    `State: ${state}`,
    `Priority: ${priorityLabel[data.priority as number] ?? "Unknown"}`,
    `Assignee: ${assignee}`,
    `Labels: ${labels}`,
  ];
  if (data.url) lines.push(`URL: ${data.url}`);
  if (description) lines.push(`\nDescription:\n${description.slice(0, 3_000)}`);

  return lines.join("\n");
}

export async function getLinearClient(): Promise<LinearClient | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "linear"));
    if (row?.enabled && row.api_key) {
      return new LinearClient({ apiKey: row.api_key });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Linear client");
  }
  return null;
}

export async function postLinearComment(ticketId: string, body: string): Promise<void> {
  const linear = await getLinearClient();
  if (!linear) {
    throw new Error("Linear integration disabled or missing API key");
  }

  try {
    await linear.createComment({ issueId: ticketId, body });
    logger.info({ ticketId }, "Posted comment to Linear issue");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, ticketId }, "Failed to post Linear comment");
    throw new Error(`Linear comment failed: ${msg}`);
  }
}

/**
 * Resolve a Linear issue reference — either a UUID or a human identifier like
 * "ENG-7" — to its id + identifier. Returns null if not found.
 */
async function resolveLinearIssue(
  linear: LinearClient,
  ref: string,
): Promise<{ id: string; identifier: string } | null> {
  const trimmed = ref.trim();
  if (/^[A-Za-z]+-\d+$/.test(trimmed)) {
    // Human identifier — resolve via search and take the exact match.
    const payload = await linear.searchIssues(trimmed);
    const match = (payload.nodes ?? []).find(
      (n) => n.identifier.toLowerCase() === trimmed.toLowerCase(),
    );
    return match ? { id: match.id, identifier: match.identifier } : null;
  }
  // Assume UUID.
  const issue = await linear.issue(trimmed);
  return issue ? { id: issue.id, identifier: issue.identifier } : null;
}

/**
 * Mark a Linear issue as a duplicate of another: creates a `duplicate` relation
 * and moves the duplicate issue into a canceled-type workflow state (preferring
 * one literally named "Duplicate" if the team has one). `duplicateOf` may be a
 * UUID or a human identifier (e.g. "ENG-7").
 */
export async function markLinearDuplicate(
  issueId: string,
  duplicateOf: string,
): Promise<{ canonicalIdentifier: string; stateName: string | null }> {
  const linear = await getLinearClient();
  if (!linear) {
    throw new Error("Linear integration disabled or missing API key");
  }

  const canonical = await resolveLinearIssue(linear, duplicateOf);
  if (!canonical) {
    throw new Error(`Could not find Linear issue '${duplicateOf}'`);
  }
  if (canonical.id === issueId) {
    throw new Error("An issue cannot be a duplicate of itself");
  }

  try {
    // 1. Relation: this issue is a duplicate of the canonical one.
    // Use the string literal rather than the IssueRelationType enum: the enum is
    // not re-exported from the SDK's main entry and is erased in the esbuild
    // bundle anyway (undefined at runtime). Its members are plain lowercase
    // strings ("duplicate"); cast the input to the method's own param type.
    type RelationInput = Parameters<typeof linear.createIssueRelation>[0];
    await linear.createIssueRelation({
      issueId,
      relatedIssueId: canonical.id,
      type: "duplicate",
    } as RelationInput);

    // 2. Move the duplicate into a canceled-type state (Linear has no dedicated
    //    "duplicate" state type — duplicates resolve as canceled). Prefer a state
    //    literally named "Duplicate" when the team defines one.
    let stateName: string | null = null;
    const issue = await linear.issue(issueId);
    const team = await issue?.team;
    if (team) {
      const statesConn = await team.states();
      const states = statesConn?.nodes ?? [];
      const target =
        states.find((s) => s.name.toLowerCase() === "duplicate") ??
        states.find((s) => s.type === "canceled");
      if (target) {
        await linear.updateIssue(issueId, { stateId: target.id });
        stateName = target.name;
      }
    }

    logger.info({ issueId, canonical: canonical.identifier, stateName }, "Marked Linear issue as duplicate");
    return { canonicalIdentifier: canonical.identifier, stateName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, issueId, duplicateOf }, "Failed to mark Linear issue as duplicate");
    throw new Error(`Mark-duplicate failed: ${msg}`);
  }
}

const MAX_LINEAR_CONTEXT_CHARS = 6_000;

export async function gatherLinearContext(ticketId: string): Promise<string> {
  const linear = await getLinearClient();
  if (!linear) {
    return "";
  }

  try {
    const issue = await linear.issue(ticketId);
    if (!issue) {
      return "";
    }

    const parts: string[] = [];
    let runningChars = 0;

    function addPart(text: string): boolean {
      if (runningChars + text.length > MAX_LINEAR_CONTEXT_CHARS) {
        return false;
      }
      parts.push(text);
      runningChars += text.length;
      return true;
    }

    // Core ticket metadata (always included; description capped separately)
    const metaLines: string[] = [
      `Title: ${issue.title}`,
      `Identifier: ${issue.identifier}`,
      `State: ${(await issue.state)?.name ?? "Unknown"}`,
      `Priority: ${issue.priorityLabel}`,
      `Assignee: ${(await issue.assignee)?.name ?? "Unassigned"}`,
    ];
    if (issue.url) metaLines.push(`URL: ${issue.url}`);
    if (issue.description) {
      const desc = issue.description.slice(0, 3_000);
      metaLines.push(`\nDescription:\n${desc}`);
    }
    addPart(metaLines.join("\n"));

    // Labels
    try {
      const labelsConn = await issue.labels();
      const labelNames = labelsConn?.nodes?.map((l) => l.name).filter(Boolean);
      if (labelNames && labelNames.length > 0) {
        addPart(`Labels: ${labelNames.join(", ")}`);
      }
    } catch {
      // ignore
    }

    // Parent / project / cycle
    try {
      const parent = await issue.parent;
      if (parent) addPart(`Parent: ${parent.identifier} — ${parent.title}`);
    } catch {
      // ignore
    }
    try {
      const project = await issue.project;
      if (project) addPart(`Project: ${project.name}`);
    } catch {
      // ignore
    }
    try {
      const cycle = await issue.cycle;
      if (cycle) addPart(`Cycle: ${cycle.name ?? cycle.number}`);
    } catch {
      // ignore
    }

    // Comments
    try {
      const commentsConn = await issue.comments();
      const comments = commentsConn?.nodes ?? [];
      if (comments.length > 0) {
        const commentLines = ["Comments:"];
        for (const c of comments.slice(0, 10)) {
          const userName = (await c.user)?.name ?? "Unknown";
          const bodyText = c.body?.slice(0, 500) ?? "";
          commentLines.push(`  — ${userName}: ${bodyText.replace(/\n/g, " ")}`);
        }
        if (comments.length > 10) commentLines.push(`  ... and ${comments.length - 10} more`);
        addPart(commentLines.join("\n"));
      }
    } catch {
      // ignore
    }

    // Relations (related / duplicate / blocking issues)
    try {
      const relationsConn = await issue.relations();
      const relations = relationsConn?.nodes ?? [];
      if (relations.length > 0) {
        const relLines = ["Related issues:"];
        for (const r of relations.slice(0, 8)) {
          const related = await r.relatedIssue;
          if (related) {
            relLines.push(`  — ${r.type ?? "related"}: ${related.identifier} — ${related.title}`);
          }
        }
        addPart(relLines.join("\n"));
      }
    } catch {
      // ignore
    }

    // Attachments (often includes linked GitHub PRs)
    try {
      const attachmentsConn = await issue.attachments();
      const attachments = attachmentsConn?.nodes ?? [];
      const ghAttachments = attachments.filter((a) => a.source === "github" || a.url?.includes("github.com"));
      if (ghAttachments.length > 0) {
        const attLines = ["Linked GitHub items:"];
        for (const a of ghAttachments.slice(0, 6)) {
          attLines.push(`  — ${a.title ?? "Attachment"}: ${a.url ?? "no url"}`);
        }
        addPart(attLines.join("\n"));
      }
    } catch {
      // ignore
    }

    const joined = parts.join("\n\n---\n\n");
    // Final safety slice in case meta section alone exceeded cap
    return joined.length > MAX_LINEAR_CONTEXT_CHARS
      ? joined.slice(0, MAX_LINEAR_CONTEXT_CHARS) + "\n\n[context truncated]"
      : joined;
  } catch (err) {
    logger.warn({ err, ticketId }, "Failed to gather Linear context");
    return "";
  }
}
