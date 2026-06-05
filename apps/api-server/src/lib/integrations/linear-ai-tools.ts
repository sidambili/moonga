import type { LinearClient } from "@linear/sdk";
import { tool } from "ai";
import { z } from "zod";
import { gatherLinearContext } from "./linear-client";

/**
 * Read-only Linear tools for the triage agent — its core job is finding related
 * or duplicate issues and grounding its read in the ticket's history. Posting the
 * triage comment is handled deterministically by the runner after the session
 * completes (single, reviewable comment), so no write tool is exposed here.
 */
export function createLinearTools(
  linear: LinearClient | null,
  checkToolLimit: () => string | null,
) {
  const noLinear = "Error: Linear integration not configured";

  return {
    search_linear_issues: tool({
      description:
        "Search existing Linear issues by free-text terms. Use this FIRST to find duplicate or related tickets before triaging — search 1-2 key phrases from the title/description. Returns matching issues with their identifier, title, state, and URL.",
      parameters: z.object({
        query: z.string().describe("Free-text search terms, e.g. 'login redirect loop'"),
        limit: z.number().optional().describe("Max results to return (default 8, max 15)"),
      }),
      execute: async ({ query, limit }) => {
        const lim = checkToolLimit();
        if (lim) return lim;
        if (!linear) return noLinear;
        try {
          const payload = await linear.searchIssues(query);
          const nodes = (payload.nodes ?? []).slice(0, Math.min(limit ?? 8, 15));
          if (nodes.length === 0) return `No issues matched "${query}".`;
          return JSON.stringify(
            nodes.map((n) => ({
              id: n.id,
              identifier: n.identifier,
              title: n.title,
              url: n.url,
              priority: n.priorityLabel,
              completed: !!n.completedAt,
              canceled: !!n.canceledAt,
              description: n.description ? n.description.slice(0, 300) : undefined,
            })),
            null,
            2,
          );
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    get_linear_issue: tool({
      description:
        "Fetch full details of a Linear issue by its UUID (the `id` field returned by search_linear_issues), including description, comments, related issues, and linked GitHub items. Use to confirm whether a candidate is a true duplicate or to pull context from a related ticket.",
      parameters: z.object({
        id: z.string().describe("The issue UUID (the `id` from a search result, not the ENG-123 identifier)"),
      }),
      execute: async ({ id }) => {
        const lim = checkToolLimit();
        if (lim) return lim;
        if (!linear) return noLinear;
        try {
          const context = await gatherLinearContext(id);
          return context || `No issue found for id ${id}.`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
  };
}
