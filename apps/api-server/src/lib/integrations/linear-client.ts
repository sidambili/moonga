import { LinearClient } from "@linear/sdk";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

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
    logger.warn({ ticketId }, "Linear integration disabled or missing API key — skipping comment");
    return;
  }

  try {
    await linear.createComment({ issueId: ticketId, body });
    logger.info({ ticketId }, "Posted comment to Linear issue");
  } catch (err) {
    logger.warn({ err, ticketId }, "Failed to post Linear comment");
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
