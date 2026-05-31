import { Octokit } from "octokit";
import { generateText, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { db } from "@workspace/db";
import { sessionsTable, sessionStepsTable, artifactsTable, eventsTable, integrationsTable, modelSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { estimateCost } from "./model-prices";

const MAX_STEPS = 8;
const MAX_TOOL_CALLS = 20;
const MAX_PAYLOAD_CHARS = 2_000;

async function getModelSettings() {
  const rows = await db.select().from(modelSettingsTable).limit(1);
  return rows[0] ?? null;
}

async function getGithubIntegration(): Promise<{ token: string | undefined; selectedRepo: string | undefined }> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "github"));
    if (row?.enabled) {
      const config = row.config as Record<string, unknown> | null;
      return {
        token: row.api_key ?? undefined,
        selectedRepo: (config?.selected_repo as string | undefined) ?? undefined,
      };
    }
  } catch {
    // ignore
  }
  return { token: undefined, selectedRepo: undefined };
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

    // List repo root only for ticket events — saves tokens for events that already have file context
    if (eventType === "ticket_created" || eventType === "issue_opened") {
      try {
        const { data: root } = await client.rest.repos.getContent({ owner, repo: repoName, path: "" });
        if (Array.isArray(root)) {
          parts.push("Repository root:");
          parts.push(root.map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n"));
        }
      } catch {
        // ignore
      }
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
  toolResult?: unknown,
) {
  await db.insert(sessionStepsTable).values({
    session_id: sessionId,
    step_number: stepNumber,
    role: role as "user" | "assistant" | "tool",
    content: content.slice(0, 50_000) || null,
    tool_calls: toolCalls ?? null,
    tool_name: toolName ?? null,
    tool_result: toolResult !== undefined ? toolResult : null,
    model: model ?? null,
    tokens_used: usage?.totalTokens ?? null,
    prompt_tokens: usage?.promptTokens ?? null,
    completion_tokens: usage?.completionTokens ?? null,
    cost: usage?.cost ?? null,
  });
}

function extractSlackMessageInfo(payload: Record<string, unknown>): string {
  const slackEvent = payload.event as Record<string, unknown> | undefined;
  if (!slackEvent) return JSON.stringify(payload, null, 2).slice(0, MAX_PAYLOAD_CHARS);

  const rawText = (slackEvent.text as string | undefined) ?? "";
  const text = rawText.replace(/<@[A-Z0-9]+>\s*/g, "").trim();

  return [
    `Message: ${text}`,
    `Channel ID: ${(slackEvent.channel as string | undefined) ?? "unknown"}`,
    `Posted by user ID: ${(slackEvent.user as string | undefined) ?? "unknown"}`,
  ].join("\n");
}

function extractLinearTicketInfo(payload: Record<string, unknown>): string {
  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return JSON.stringify(payload, null, 2).slice(0, MAX_PAYLOAD_CHARS);

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

async function getSlackBotToken(): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "slack"));
    if (row?.enabled && row.api_key) return row.api_key;
  } catch {
    // ignore
  }
  return null;
}

async function postSlackReply(channel: string, threadTs: string, text: string, botToken: string): Promise<void> {
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({ channel, thread_ts: threadTs, text, mrkdwn: true }),
  });
  const data = await resp.json() as { ok: boolean; error?: string };
  if (!data.ok) logger.warn({ channel, error: data.error }, "Slack reply failed");
}

function parseConfidence(text: string): number {
  const match = text.match(/CONFIDENCE:\s*([\d.]+)\s*$/im);
  return match ? Math.min(1, Math.max(0, parseFloat(match[1]))) : 0.75;
}

function stripConfidence(text: string): string {
  return text.replace(/\n?CONFIDENCE:\s*[\d.]+\s*$/im, "").trim();
}

function buildSystemPrompt(techStack?: string): string {
  const stackLine = techStack
    ? `\nThis repository uses ${techStack}. Use language-idiomatic patterns in your analysis.\n`
    : "";
  return `You are an expert SRE and engineering analyst. You analyze inbound engineering events (tickets, PRs, errors) and produce actionable, source-code-grounded analysis.${stackLine}
You have access to GitHub tools: get_file_contents, list_directory, search_code, get_recent_commits, get_commit_diff, get_pull_request, get_issue. Use them when the pre-fetched context is insufficient.

Tool use strategy:
- For errors/regressions: start with get_recent_commits to find the likely culprit, then read specific files
- For tickets/features: start with list_directory to understand structure, then read relevant files
- For PRs: the diff is usually pre-fetched; only call tools if you need surrounding context
- Avoid reading files larger than needed; prefer search_code to locate relevant symbols first

Rules:
- Base analysis on actual source code, not assumptions
- Be concise (max 300 words)
- End your response with exactly: CONFIDENCE: <0.0–1.0>`;
}

function buildUserPrompt(
  objective: string,
  source: string,
  eventType: string,
  title: string,
  payload: unknown,
  context: string,
): string {
  const ticketInfo = source === "linear"
    ? extractLinearTicketInfo(payload as Record<string, unknown>)
    : source === "slack"
    ? extractSlackMessageInfo(payload as Record<string, unknown>)
    : JSON.stringify(payload, null, 2).slice(0, MAX_PAYLOAD_CHARS);
  const contextBlock = context ? `\n\nRepository context:\n${context}` : "";

  if (objective === "diagnose") {
    return `Analyze this inbound engineering event and produce a concise diagnosis.

Source: ${source}
Event type: ${eventType}
Title: ${title}
${ticketInfo}${contextBlock}

Respond with:
1. Root cause assessment
2. Severity justification
3. Recommended immediate actions
4. Estimated resolution time`;
  }

  return `Analyze this ticket and produce a source-code-grounded action plan.

Source: ${source}
Event type: ${eventType}
Title: ${title}
${ticketInfo}${contextBlock}

Before writing the plan:
- Extract 2-3 key technical terms from the title/description (function names, feature areas, module names — not generic words)
- Use search_code with those terms to find the relevant files; fall back to list_directory if needed
- Read the relevant files to understand the current implementation
- If the ticket has no description, state that in the objective summary and skip to what you can infer from context
- Base every task on what you actually find in the code

Respond with:
1. Objective summary
2. Key tasks (numbered, each referencing the relevant file/function)
3. Dependencies or blockers
4. Estimated complexity (Low / Medium / High)`;
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

function categorizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429")) return "rate_limited";
  if (lower.includes("context length") || lower.includes("too long") || lower.includes("maximum context")) return "context_length_exceeded";
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("invalid api key") || lower.includes("incorrect api key")) return "unauthorized";
  if (lower.includes("timeout") || lower.includes("etimedout")) return "timeout";
  if (lower.includes("enotfound") || lower.includes("econnrefused")) return "network_error";
  return "unknown";
}

function getRepoFromPayload(payload: Record<string, unknown>, repoId?: string): { owner: string; repo: string } | null {
  const repo = payload.repository as { full_name?: string } | undefined;
  const fullName = repo?.full_name || repoId;
  if (!fullName) return null;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  return { owner, repo: name };
}

async function detectTechStack(
  client: Octokit,
  owner: string,
  repoName: string,
): Promise<string> {
  const checks = [
    { path: "package.json", label: "JavaScript/Node.js" },
    { path: "Cargo.toml", label: "Rust" },
    { path: "pyproject.toml", label: "Python" },
    { path: "requirements.txt", label: "Python" },
    { path: "go.mod", label: "Go" },
    { path: "composer.json", label: "PHP" },
    { path: "Gemfile", label: "Ruby" },
    { path: "pom.xml", label: "Java" },
    { path: "build.gradle", label: "Java" },
    { path: "pubspec.yaml", label: "Dart/Flutter" },
  ];

  for (const c of checks) {
    try {
      const { data } = await client.rest.repos.getContent({ owner, repo: repoName, path: c.path });
      if (!Array.isArray(data) && data.type === "file") {
        if (c.path === "package.json") {
          try {
            const content = Buffer.from(data.content, "base64").toString("utf-8");
            const pkg = JSON.parse(content);
            const deps = Object.keys(pkg.dependencies || {});
            const devDeps = Object.keys(pkg.devDependencies || {});
            const all = [...deps, ...devDeps];
            const fw: string[] = [];
            if (all.includes("react")) fw.push("React");
            if (all.includes("next")) fw.push("Next.js");
            if (all.includes("vue")) fw.push("Vue");
            if (all.includes("svelte")) fw.push("Svelte");
            if (all.includes("express")) fw.push("Express");
            if (all.includes("fastify")) fw.push("Fastify");
            if (devDeps.includes("typescript") || deps.includes("typescript")) fw.push("TypeScript");
            return `JavaScript/Node.js${fw.length ? ` — ${fw.join(", ")}` : ""}`;
          } catch {
            return "JavaScript/Node.js";
          }
        }
        return c.label;
      }
    } catch {
      // file not found
    }
  }
  return "";
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
      .set({ status: "failed", failure_reason: "missing_event", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    logger.warn({ sessionId }, "Session has no associated event — marked failed");
    return;
  }

  const settings = await getModelSettings();
  if (!settings?.api_key) {
    await db
      .update(sessionsTable)
      .set({ status: "failed", failure_reason: "missing_api_key", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    logger.warn({ sessionId }, "No API key in model settings — session marked failed");
    return;
  }

  const { session, event } = row;
  const modelString =
    session.objective === "plan"
      ? (settings.plan_model ?? "gpt-4o")
      : (settings.triage_model ?? "gpt-4o-mini");

  const { token: githubToken, selectedRepo } = await getGithubIntegration();
  const repo = getRepoFromPayload(event.payload_raw as Record<string, unknown>, event.repo_id ?? selectedRepo ?? undefined);

  // Fetch tech stack and event context in parallel
  const [techStack, context] = await Promise.all([
    repo && githubToken
      ? detectTechStack(new Octokit({ auth: githubToken }), repo.owner, repo.repo)
      : Promise.resolve(""),
    gatherEventContext(
      event.event_type,
      event.payload_raw as Record<string, unknown>,
      githubToken,
      event.repo_id ?? selectedRepo ?? undefined,
    ),
  ]);

  const systemPrompt = buildSystemPrompt(techStack || undefined);
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

  // Shared client — avoids re-instantiating Octokit on every tool call
  const ghClient = repo && githubToken ? new Octokit({ auth: githubToken }) : null;
  const noGithub = "Error: GitHub integration not configured";

  let toolCallsUsed = 0;
  function checkToolLimit(): string | null {
    if (++toolCallsUsed > MAX_TOOL_CALLS) {
      return "Tool call limit reached. Write your final answer using the information gathered so far.";
    }
    return null;
  }

  const githubTools = {
    get_file_contents: tool({
      description: "Fetch the contents of a file from the GitHub repository. Also use this for package manifests (package.json, Cargo.toml, go.mod, etc.).",
      parameters: z.object({
        path: z.string().describe("File path within the repo, e.g. 'src/index.ts'"),
        ref: z.string().optional().describe("Git ref (branch, tag, or commit SHA)"),
      }),
      execute: async ({ path, ref }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.getContent({ owner: repo.owner, repo: repo.repo, path, ref });
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
    get_commit_diff: tool({
      description: "Get the diff (patch) for a specific commit SHA. Useful for analyzing what changed.",
      parameters: z.object({
        sha: z.string().describe("Commit SHA"),
      }),
      execute: async ({ sha }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.getCommit({ owner: repo.owner, repo: repo.repo, ref: sha });
          const files = data.files?.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch || "",
          })) ?? [];
          return JSON.stringify(files, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
    get_pull_request: tool({
      description: "Get details about a pull request including title, body, changed files, and diff.",
      parameters: z.object({
        number: z.number().describe("Pull request number"),
      }),
      execute: async ({ number }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const [{ data: pr }, { data: files }] = await Promise.all([
            ghClient.rest.pulls.get({ owner: repo.owner, repo: repo.repo, pull_number: number }),
            ghClient.rest.pulls.listFiles({ owner: repo.owner, repo: repo.repo, pull_number: number }),
          ]);
          return JSON.stringify({
            title: pr.title,
            body: pr.body,
            state: pr.state,
            additions: pr.additions,
            deletions: pr.deletions,
            changed_files: pr.changed_files,
            files: files.map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch || "" })),
          }, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
    get_issue: tool({
      description: "Get details about a GitHub issue including title, body, labels, and comments.",
      parameters: z.object({
        number: z.number().describe("Issue number"),
      }),
      execute: async ({ number }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const [{ data: issue }, { data: comments }] = await Promise.all([
            ghClient.rest.issues.get({ owner: repo.owner, repo: repo.repo, issue_number: number }),
            ghClient.rest.issues.listComments({ owner: repo.owner, repo: repo.repo, issue_number: number }),
          ]);
          return JSON.stringify({
            title: issue.title,
            body: issue.body,
            state: issue.state,
            labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
            comments: comments.map((c) => ({ body: c.body, user: c.user?.login, created_at: c.created_at })),
          }, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
    get_recent_commits: tool({
      description: "Get the most recent commits on the default branch. Useful for spotting regressions.",
      parameters: z.object({
        per_page: z.number().optional().describe("Number of commits to fetch (max 30)"),
      }),
      execute: async ({ per_page }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.listCommits({
            owner: repo.owner,
            repo: repo.repo,
            per_page: Math.min(per_page || 10, 30),
          });
          return JSON.stringify(data.map((c) => ({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author?.name,
            date: c.commit.author?.date,
          })), null, 2);
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
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.getContent({ owner: repo.owner, repo: repo.repo, path: path || "", ref });
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
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const q = `${query} repo:${repo.owner}/${repo.repo}`;
          const { data } = await ghClient.rest.search.code({ q });
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
      maxTokens: 4_000,
      tools: githubTools,
    });

    // Persist each step from the Vercel AI SDK result
    let stepNum = 1;
    for (const step of result.steps) {
      const stepUsage = step.usage ? {
        promptTokens: step.usage.promptTokens,
        completionTokens: step.usage.completionTokens,
        totalTokens: step.usage.totalTokens,
        cost: await estimateCost(modelString, {
          promptTokens: step.usage.promptTokens,
          completionTokens: step.usage.completionTokens,
        }),
      } : undefined;

      if (step.text || (step.toolCalls && step.toolCalls.length > 0)) {
        await persistStep(sessionId, stepNum, "assistant", step.text ?? "", modelString, stepUsage, step.toolCalls as unknown[]);
      }

      for (const tr of step.toolResults ?? []) {
        await persistStep(sessionId, stepNum, "tool", String(tr.result ?? "No result"), modelString, undefined, undefined, tr.toolName, tr.result);
      }

      stepNum++;
    }

    let finalTextRaw = result.text;

    // Fallback: some providers/models don't produce text after tool results.
    // Retry without tools, feeding the tool results back as context.
    if (!finalTextRaw && result.steps.some((s) => s.toolCalls && s.toolCalls.length > 0)) {
      const toolResults = result.steps.flatMap((s) => s.toolResults ?? []);
      const retryPrompt = `${userPrompt}\n\n[Tool results gathered]\n${toolResults
        .map((tr) => `Tool: ${tr.toolName}\nResult: ${JSON.stringify(tr.result).slice(0, 10_000)}`)
        .join("\n---\n")}\n\nBased on the above tool results, produce your final analysis now.`;

      const retryResult = await generateText({
        model: modelConfig,
        system: systemPrompt,
        prompt: retryPrompt,
        maxTokens: 4_000,
      });

      finalTextRaw = retryResult.text;
    }

    const finalText = stripConfidence(finalTextRaw);

    if (!finalText) {
      logger.warn({ sessionId, steps: result.steps.length }, "Agent produced no final text — marking failed");
      await db
        .update(sessionsTable)
        .set({ status: "failed", failure_reason: "empty_output", model_used: modelString, updated_at: new Date() })
        .where(eq(sessionsTable.id, sessionId));
      return;
    }

    const finalConfidence = parseConfidence(finalTextRaw);

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

    if (event.source === "slack") {
      const slackToken = await getSlackBotToken();
      const slackEvent = (event.payload_raw as Record<string, unknown>).event as Record<string, unknown> | undefined;
      const channel = slackEvent?.channel as string | undefined;
      const threadTs = slackEvent?.ts as string | undefined;
      if (slackToken && channel && threadTs) {
        postSlackReply(channel, threadTs, `*Analysis complete*\n${finalText.slice(0, 2_800)}`, slackToken).catch((err) =>
          logger.warn({ err }, "Failed to post Slack reply"),
        );
      }
    }

    logger.info({ sessionId, model: modelString, confidence: finalConfidence, steps: result.steps.length }, "Session completed → needs_review");
  } catch (err) {
    const reason = categorizeError(err);
    logger.error({ err, sessionId, reason }, "Agent loop failed");
    await db
      .update(sessionsTable)
      .set({ status: "failed", failure_reason: reason, updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
  }
}
