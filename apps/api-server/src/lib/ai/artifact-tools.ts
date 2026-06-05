import { tool } from "ai";
import { z } from "zod";
import { db } from "@workspace/db";
import { artifactsTable, agentSessionsTable, eventsTable } from "@workspace/db";
import { eq, or, ilike, desc } from "drizzle-orm";

/**
 * Read-only tool for finding prior analyses. Lets the triage agent discover that
 * a ticket (or a duplicate of it) was already diagnosed/planned and reference that
 * artifact instead of escalating to an expensive re-plan.
 */
export function createArtifactTools(checkToolLimit: () => string | null) {
  return {
    search_existing_artifacts: tool({
      description:
        "Search prior analyses (plan/diagnosis/triage artifacts) by free-text terms matched against the originating event title and the artifact content. Use to check whether this ticket — or a duplicate of it — has already been analyzed, so you can reference the existing work instead of escalating to a new plan.",
      parameters: z.object({
        query: z.string().describe("Free-text terms, e.g. the ticket title or a key phrase"),
        limit: z.number().optional().describe("Max results (default 5, max 10)"),
      }),
      execute: async ({ query, limit }) => {
        const lim = checkToolLimit();
        if (lim) return lim;
        const term = query.trim();
        if (!term) return "Error: empty query";
        try {
          const like = `%${term}%`;
          const rows = await db
            .select({
              artifact_id: artifactsTable.id,
              type: artifactsTable.type,
              approval_state: artifactsTable.approval_state,
              content: artifactsTable.content,
              created_at: artifactsTable.created_at,
              session_id: agentSessionsTable.id,
              objective: agentSessionsTable.objective,
              event_title: eventsTable.title,
              event_source: eventsTable.source,
              ticket_id: eventsTable.ticket_id,
            })
            .from(artifactsTable)
            .innerJoin(agentSessionsTable, eq(artifactsTable.session_id, agentSessionsTable.id))
            .leftJoin(eventsTable, eq(agentSessionsTable.event_id, eventsTable.id))
            .where(or(ilike(eventsTable.title, like), ilike(artifactsTable.content, like)))
            .orderBy(desc(artifactsTable.id))
            .limit(Math.min(limit ?? 5, 10));

          if (rows.length === 0) return `No existing artifacts matched "${term}".`;
          return JSON.stringify(
            rows.map((r) => ({
              artifact_id: r.artifact_id,
              session_id: r.session_id,
              type: r.type,
              objective: r.objective,
              approval_state: r.approval_state,
              event_title: r.event_title,
              event_source: r.event_source,
              created_at: r.created_at,
              excerpt: r.content.slice(0, 400),
            })),
            null,
            2,
          );
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
  };
}
