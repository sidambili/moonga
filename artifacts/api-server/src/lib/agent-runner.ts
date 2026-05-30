import { Octokit } from "octokit";
import { generateText, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { db } from "@workspace/db";
import { sessionsTable, sessionStepsTable, artifactsTable, eventsTable, integrationsTable, modelSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const MAX_STEPS = 10;
const MAX_PAYLOAD_CHARS = 2_000;

async function getModelSettings() {
  const rows = await db.select().from(modelSettingsTable).limit(1);
  return rows[0] ?? null;
}

async function getGithubToken(): Promise<string | undefined> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "github"));
    if (row?.enabled && row.api_key) {
      return row.api_key;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function gatherEventContext(
  eventType: string,
  payload: Record<string, unknown>,
  githubToken: string | undefined,
  repoId?: string,
): Promise<string> {
  if (!githubToken) return "";

  const repo = payload.repository as { full_name?: string } | undefined;
  const repoFullName = repo?.full_name || repoId;
  if (!repoFullName) return "";
  const [owner, repoName] = repoFullName.split("/");
  if (!owner || !repoName) return "";

  const client = new Octokit({ auth: githubToken });
  const parts: string[] = [];

  try {
    if (eventType === "pr_opened" || eventType === "pr_merged" || eventType === "pr_closed") {
      const prNumber = (payload.pull_request as { number?: number } | undefined)?.number;
      if (prNumber) {
        try {
          const { data: pr } = await client.rest.pulls.get({ owner, repo: repoName, pull_number: prNumber });
          const { data: files } = await client.rest.pulls.listFiles({ owner, repo: repoName, pull_number: prNumber });
          parts.push(`PR #${pr.number}: ${pr.title}`);
          parts.push(`State: ${pr.state} | Additions: ${pr.additions} | Deletions: ${pr.deletions} | Changed files: ${pr.changed_files}`);
          if (pr.body) parts.push(`Description:\n${pr.body.slice(0, 2_000)}`);
          if (files.length > 0) {
            parts.push("Changed files:");
            for (const f of files.slice(0, 20)) {
              parts.push(`  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`);
              if (f.patch) parts.push(`    Patch:\n${f.patch.slice(0, 5_000)}`);
            }
          }
        } catch (err) {
          parts.push(`Could not fetch PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (eventType === "issue_opened" || eventType === "issue_updated") {
      const issueNumber = (payload.issue as { number?: number } | undefined)?.number;
      if (issueNumber) {
        try {
          const { data: issue } = await client.rest.issues.get({ owner, repo: repoName, issue_number: issueNumber });
          const { data: comments } = await client.rest.issues.listComments({ owner, repo: repoName, issue_number: issueNumber });
          parts.push(`Issue #${issue.number}: ${issue.title}`);
          parts.push(`State: ${issue.state} | Labels: ${issue.labels.map((l) => (typeof l === "string" ? l : l.name)).join(", ")}`);
          if (issue.body) parts.push(`Body:\n${issue.body.slice(0, 2_000)}`);
          if (comments.length > 0) {
            parts.push("Comments:");
            for (const c of comments.slice(0, 5)) {
              parts.push(`  ${c.user?.login}: ${c.body?.slice(0, 500)}`);
            }
          }
        } catch (err) {
          parts.push(`Could not fetch issue #${issueNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (eventType === "push") {
      const sha = (payload.head_commit as { id?: string } | undefined)?.id;
      if (sha) {
        try {
          const { data: commit } = await client.rest.repos.getCommit({ owner, repo: repoName, ref: sha });
          parts.push(`Commit: ${commit.commit.message}`);
          parts.push(`Author: ${commit.commit.author?.name} | Date: ${commit.commit.author?.date}`);
          if (commit.files && commit.files.length > 0) {
            parts.push("Files changed:");
            for (const f of commit.files.slice(0, 20)) {
              parts.push(`  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`);
              if (f.patch) parts.push(`    Patch:\n${f.patch.slice(0, 5_000)}`);
            }
          }
        } catch (err) {
          parts.push(`Could not fetch commit ${sha}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (eventType === "ticket_created") {
      try {
        const { data: readme } = await client.rest.repos.getContent({ owner, repo: repoName, path: "README.md" });
        if (!Array.isArray(readme) && "content" in readme && typeof readme.content === "string") {
          const decoded = Buffer.from(readme.content, "base64").toString("utf8");
          parts.push(`README.md:\n${decoded.slice(0, 3_000)}`);
        }
      } catch (err) {
        parts.push(`Could not fetch README: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Always list repo root for orientation
    try {
      const { data: root } = await client.rest.repos.getContent({ owner, repo: repoName, path: "" });
      if (Array.isArray(root)) {
        parts.push("Repository root:");
        parts.push(root.map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n"));
      }
    } catch {
      // ignore
    }
  } catch (err) {
    logger.warn({ err }, "Context gathering failed");
  }

  return parts.join("\n\n");
}

async function persistStep(
  sessionId: number,
  stepNumber: number,
  role: string,
  content: string,
  model?: string,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; cost?: number },
  toolCalls?: unknown[],
  toolName?: string,
) {
  await db.insert(sessionStepsTable).values({
    session_id: sessionId,
    step_number: stepNumber,
    role: role as "user" | "assistant" | "tool",
    content: content.slice(0, 50_000) || null,
    tool_calls: toolCalls ?? null,
    tool_name: toolName ?? null,
    model: model ?? null,
    tokens_used: usage?.totalTokens ?? null,
    prompt_tokens: usage?.promptTokens ?? null,
    completion_tokens: usage?.completionTokens ?? null,
    cost: usage?.cost ?? null,
  });
}

function parseConfidence(text: string): number {
  const match = text.match(/CONFIDENCE:\s*([\d.]+)\s*$/im);
  return match ? Math.min(1, Math.max(0, parseFloat(match[1]))) : 0.75;
}

function buildSystemPrompt(): string {
  return `You are an expert SRE and engineering analyst. You analyze inbound engineering events (tickets, PRs, errors) and produce actionable, source-code-grounded analysis.

You have access to GitHub repository tools to read files, list directories, and search code. Use these tools when the pre-fetched repository context is insufficient.

Rules:
- Always base your analysis on actual source code, not assumptions
- If you need to see more code, use the available tools
- Be concise (max 300 words for the final answer)
- On the very last line write exactly: CONFIDENCE: <0.0–1.0>`;
}

function buildUserPrompt(
  objective: string,
  source: string,
  eventType: string,
  title: string,
  payload: unknown,
  context: string,
): string {
  const payloadStr = JSON.stringify(payload, null, 2).slice(0, MAX_PAYLOAD_CHARS);
  const contextBlock = context ? `\n\nRepository context:\n${context}` : "";

  if (objective === "diagnose") {
    return `Analyze this inbound engineering event and produce a concise diagnosis.

Source: ${source}
Event type: ${eventType}
Title: ${title}
Payload:
${payloadStr}${contextBlock}

Respond with:
1. Root cause assessment
2. Severity justification
3. Recommended immediate actions
4. Estimated resolution time

Be concise (max 300 words). On the very last line write exactly: CONFIDENCE: <0.0–1.0>`;
  }

  return `Analyze this ticket/task and produce an action plan.

Source: ${source}
Event type: ${eventType}
Title: ${title}
Payload:
${payloadStr}${contextBlock}

Respond with:
1. Objective summary
2. Key tasks (numbered)
3. Dependencies or blockers
4. Estimated complexity (Low / Medium / High)

Be concise (max 300 words). On the very last line write exactly: CONFIDENCE: <0.0–1.0>`;
}

function getModelConfig(settings: NonNullable<Awaited<ReturnType<typeof getModelSettings>>>, modelString: string) {
  const isOpenRouter = settings.provider === "openrouter" || (settings.base_url && settings.base_url.includes("openrouter"));
  if (isOpenRouter) {
    const openrouter = createOpenRouter({ apiKey: settings.api_key! });
    return openrouter.chat(modelString);
  }
  const openaiProvider = createOpenAI({ apiKey: settings.api_key!, baseURL: settings.base_url ?? undefined });
  return openaiProvider.chat(modelString);
}

function getRepoFromPayload(payload: Record<string, unknown>, repoId?: string): { owner: string; repo: string } | null {
  const repo = payload.repository as { full_name?: string } | undefined;
  const fullName = repo?.full_name || repoId;
  if (!fullName) return null;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  return { owner, repo: name };
}

export async function runAgentSession(sessionId: number): Promise<void> {
  await db
    .update(sessionsTable)
    .set({ status: "running", updated_at: new Date() })
    .where(eq(sessionsTable.id, sessionId));

  const [row] = await db
    .select({ session: sessionsTable, event: eventsTable })
    .from(sessionsTable)
    .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
    .where(eq(sessionsTable.id, sessionId));

  if (!row?.event) {
    await db
      .update(sessionsTable)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    logger.warn({ sessionId }, "Session has no associated event — marked failed");
    return;
  }

  const settings = await getModelSettings();
  if (!settings?.api_key) {
    await db
      .update(sessionsTable)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    logger.warn({ sessionId }, "No API key in model settings — session marked failed");
    return;
  }

  const { session, event } = row;
  const modelString =
    session.objective === "plan"
      ? (settings.plan_model ?? "gpt-4o")
      : (settings.triage_model ?? "gpt-4o-mini");

  const githubToken = await getGithubToken();
  const repo = getRepoFromPayload(event.payload_raw as Record<string, unknown>, event.repo_id ?? undefined);

  // Pre-fetch repository context based on event type
  const context = await gatherEventContext(
    event.event_type,
    event.payload_raw as Record<string, unknown>,
    githubToken,
    event.repo_id ?? undefined,
  );

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(
    session.objective,
    event.source,
    event.event_type,
    event.title ?? "Untitled",
    event.payload_raw,
    context,
  );

  // Persist pre-fetched context and user prompt
  if (context) {
    await persistStep(sessionId, -1, "tool", `[System] Pre-fetched repository context:\n${context}`, undefined, undefined, undefined, "gather_event_context");
  }
  await persistStep(sessionId, 0, "user", userPrompt);

  // Define GitHub tools — execute returns error if repo/token missing
  const githubTools = {
    get_file_contents: tool({
      description: "Fetch the contents of a file from the GitHub repository",
      parameters: z.object({
        path: z.string().describe("File path within the repo, e.g. 'src/index.ts'"),
        ref: z.string().optional().describe("Git ref (branch, tag, or commit SHA)"),
      }),
      execute: async ({ path, ref }) => {
        if (!repo || !githubToken) return "Error: GitHub integration not configured";
        const client = new Octokit({ auth: githubToken });
        try {
          const { data } = await client.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.repo,
            path,
            ref,
          });
          if (Array.isArray(data)) return "Error: path is a directory, not a file";
          if (data.type === "file") {
            const content = data.content ? Buffer.from(data.content, "base64").toString("utf-8") : "";
            return content.length > 100_000 ? content.slice(0, 100_000) + "\n\n[...truncated]" : content;
          }
          return "Error: not a file";
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
    list_directory: tool({
      description: "List files and directories at a path in the GitHub repository",
      parameters: z.object({
        path: z.string().describe("Directory path. Use empty string for root."),
        ref: z.string().optional(),
      }),
      execute: async ({ path, ref }) => {
        if (!repo || !githubToken) return "Error: GitHub integration not configured";
        const client = new Octokit({ auth: githubToken });
        try {
          const { data } = await client.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.repo,
            path: path || "",
            ref,
          });
          if (!Array.isArray(data)) return "Error: not a directory";
          return JSON.stringify(data.map((e) => ({ name: e.name, type: e.type, path: e.path, size: e.size })), null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
    search_code: tool({
      description: "Search for code across the GitHub repository",
      parameters: z.object({
        query: z.string().describe("Search query, e.g. 'filename:package.json' or 'class User'"),
      }),
      execute: async ({ query }) => {
        if (!repo || !githubToken) return "Error: GitHub integration not configured";
        const client = new Octokit({ auth: githubToken });
        try {
          const q = `${query} repo:${repo.owner}/${repo.repo}`;
          const { data } = await client.rest.search.code({ q });
          return JSON.stringify({
            total_count: data.total_count,
            items: data.items.map((item) => ({ path: item.path, url: item.html_url, score: item.score })),
          }, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
  };

  const modelConfig = getModelConfig(settings, modelString);

  try {
    const result = await generateText({
      model: modelConfig,
      system: systemPrompt,
      prompt: userPrompt,
      maxSteps: MAX_STEPS,
      tools: githubTools,
    });

    // Persist each step from the Vercel AI SDK result
    let stepNum = 1;
    for (const step of result.steps) {
      const stepUsage = step.usage ? {
        promptTokens: step.usage.promptTokens,
        completionTokens: step.usage.completionTokens,
        totalTokens: step.usage.totalTokens,
      } : undefined;

      if (step.text) {
        await persistStep(sessionId, stepNum, "assistant", step.text, modelString, stepUsage, step.toolCalls as unknown[]);
      }

      for (const tr of step.toolResults ?? []) {
        await persistStep(sessionId, stepNum, "tool", String(tr.result ?? "No result"), modelString, undefined, undefined, tr.toolName);
      }

      stepNum++;
    }

    const finalText = result.text;
    const finalConfidence = parseConfidence(finalText);

    await db
      .update(sessionsTable)
      .set({
        status: "needs_review",
        output_summary: finalText,
        confidence_score: finalConfidence,
        model_used: modelString,
        updated_at: new Date(),
      })
      .where(eq(sessionsTable.id, sessionId));

    const artifactType = session.objective === "plan" ? "action_plan" : "diagnosis";
    await db.insert(artifactsTable).values({
      session_id: sessionId,
      type: artifactType,
      content: finalText,
      approval_state: "draft",
    });

    await db
      .update(eventsTable)
      .set({ status: "needs_review" })
      .where(eq(eventsTable.id, event.id));

    logger.info({ sessionId, model: modelString, confidence: finalConfidence, steps: result.steps.length }, "Session completed → needs_review");
  } catch (err) {
    logger.error({ err, sessionId }, "Agent loop failed");
    await db
      .update(sessionsTable)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
  }
}
