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
import { postLinearComment } from "./integrations/linear-client";

const MAX_STEPS = 15;
const MAX_TOOL_CALLS = 30;
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
      } catch {
        // no readme
      }

      // Read package.json / go.mod / pyproject.toml to give the agent dependency context
      for (const manifest of ["package.json", "go.mod", "pyproject.toml", "Cargo.toml"]) {
        try {
          const { data } = await client.rest.repos.getContent({ owner, repo: repoName, path: manifest });
          if (!Array.isArray(data) && "content" in data && typeof data.content === "string") {
            const decoded = Buffer.from(data.content, "base64").toString("utf8");
            parts.push(`${manifest}:\n${decoded.slice(0, 2_000)}`);
            break; // one manifest is enough
          }
        } catch {
          // not present
        }
      }
    }

    // List repo root + expand key source dirs one level deep so the agent has a map without burning tool calls
    if (eventType === "ticket_created" || eventType === "issue_opened") {
      try {
        const { data: root } = await client.rest.repos.getContent({ owner, repo: repoName, path: "" });
        if (Array.isArray(root)) {
          parts.push("Repository root:");
          parts.push(root.map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n"));

          // Expand common source dirs so the agent has a file map
          const expandDirs = root
            .filter((e) => e.type === "dir" && ["src", "lib", "app", "apps", "packages", "services", "api", "server", "backend", "frontend"].includes(e.name))
            .slice(0, 4);

          await Promise.all(
            expandDirs.map(async (dir) => {
              try {
                const { data: children } = await client.rest.repos.getContent({ owner, repo: repoName, path: dir.path });
                if (Array.isArray(children)) {
                  parts.push(`📁 ${dir.name}/`);
                  parts.push(children.map((e) => `  ${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n"));
                }
              } catch {
                // ignore
              }
            }),
          );
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

interface AgentOutput {
  content: string;
  slack_summary: string;
  confidence: number;
}

function parseAgentOutput(raw: string): AgentOutput {
  // Strip markdown code fences the model sometimes wraps around JSON
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
      const content = String(parsed.content ?? "").trim();
      if (content) {
        return {
          content,
          slack_summary: String(parsed.slack_summary ?? "").trim() || content.slice(0, 300),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.75))),
        };
      }
    } catch {
      // fall through to legacy
    }
  }

  // Legacy fallback: plain-text response with optional CONFIDENCE: trailer
  const confidenceMatch = raw.match(/CONFIDENCE:\s*([\d.]+)\s*$/im);
  const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.75;
  const content = raw.replace(/\n?CONFIDENCE:\s*[\d.]+\s*$/im, "").trim();
  return { content, slack_summary: content.slice(0, 300), confidence };
}

function buildSystemPrompt(techStack?: string, objective?: string): string {
  const stackLine = techStack
    ? `\nThis repository uses ${techStack}. Use language-idiomatic patterns in your analysis.\n`
    : "";
  const contentGuidance = objective === "plan"
    ? "Write a detailed plan (600–1000 words). Every task must cite real file paths and function/class names you found in the code. Avoid vague instructions."
    : "Be concise (200–300 words). Focus on root cause and the single most important action.";
  return `You are an expert SRE and engineering analyst. You analyze inbound engineering events (tickets, PRs, errors) and produce actionable, source-code-grounded analysis.${stackLine}
You have access to GitHub tools: get_file_contents, list_directory, search_code, get_recent_commits, get_commit_diff, get_pull_request, get_issue. Use them proactively — the pre-fetched context is a map, not the full picture.

Tool use strategy:
- For tickets/features: the repository file map is pre-fetched. Use search_code with 2-3 key terms from the ticket to find relevant files, then read those files with get_file_contents before writing the plan.
- Read at least 2-3 files directly relevant to the ticket before producing output. Plans based only on file names are not acceptable.
- For errors/regressions: start with get_recent_commits to find the likely culprit, then read specific files.
- For PRs: the diff is usually pre-fetched; only call tools if you need surrounding context.
- Prefer search_code to locate symbols first, then get_file_contents to read the implementation.

Rules:
- Base analysis on actual source code, not assumptions. Quote real function/class names and file paths.
- ${contentGuidance}
- Respond with valid JSON only — no surrounding text or code fences — in exactly this shape:
{
  "content": "<full markdown analysis>",
  "slack_summary": "<2-3 plain-text sentences, no markdown, suitable for a Slack reply>",
  "confidence": <float 0.0–1.0>
}`;
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

Respond with valid JSON only — no surrounding text or code fences:
{
  "content": "<markdown diagnosis with: root cause assessment, severity justification, recommended immediate actions, estimated resolution time>",
  "slack_summary": "<2-3 plain-text sentences: what the issue is and the top action to take>",
  "confidence": <float 0.0–1.0>
}`;
  }

  return `Analyze this ticket and produce a source-code-grounded implementation plan.

Source: ${source}
Event type: ${eventType}
Title: ${title}
${ticketInfo}${contextBlock}

REQUIRED steps before writing the plan:
1. Extract 2-4 key technical terms from the title/description (function names, service names, module names — not generic words like "add" or "update").
2. Call search_code for each term to locate the relevant files.
3. Call get_file_contents on the 2-4 most relevant files to read the actual implementation.
4. Only then write the plan, referencing real file paths and function/class names you read.

The plan MUST include:
- Objective summary (what the ticket asks for and why)
- Step-by-step tasks, each with: file path(s) to change, what to add/modify/remove, and why
- Any new files or dependencies needed
- Dependencies or blockers (e.g. DB migration, feature flag, other tickets)
- Estimated complexity: Low / Medium / High with a 1-sentence justification

If the ticket description is vague, say so in the objective summary and focus the plan on what can be inferred from the code you read.

Respond with valid JSON only — no surrounding text or code fences:
{
  "content": "<detailed markdown plan, 600-1000 words, citing real file:function references>",
  "slack_summary": "<2-3 plain-text sentences: what the ticket is about and the first concrete step>",
  "confidence": <float 0.0–1.0>
}`;
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

// Ordered by priority — first match wins per "slot" (agent instructions, cursor, windsurf, github)
const INSTRUCTION_FILE_CANDIDATES = [
  // Agent instruction files (Claude, OpenAI, generic)
  "CLAUDE.md",
  ".claude/CLAUDE.md",
  "AGENTS.md",
  ".github/AGENTS.md",
  "agents.md",
  // Cursor
  ".cursorrules",
  ".cursor/rules",
  // Windsurf
  ".windsurfrules",
  ".windsurf/rules",
  // GitHub Copilot / generic
  ".github/copilot-instructions.md",
  ".github/instructions/instructions.md",
  ".github/instructions/coding.md",
];

async function fetchRepoInstructions(client: Octokit, owner: string, repoName: string): Promise<string> {
  const found: string[] = [];

  await Promise.all(
    INSTRUCTION_FILE_CANDIDATES.map(async (path) => {
      try {
        const { data } = await client.rest.repos.getContent({ owner, repo: repoName, path });
        if (!Array.isArray(data) && "content" in data && typeof data.content === "string") {
          const decoded = Buffer.from(data.content, "base64").toString("utf-8");
          if (decoded.trim()) {
            found.push(`### ${path}\n${decoded.slice(0, 4_000)}`);
          }
        }
      } catch {
        // file doesn't exist — skip
      }
    }),
  );

  if (found.length === 0) return "";
  return `Repository AI instructions (treat these as authoritative context for this codebase):\n\n${found.join("\n\n---\n\n")}`;
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

  const ghClientEarly = repo && githubToken ? new Octokit({ auth: githubToken }) : null;

  // Fetch tech stack, event context, and repo instruction files in parallel
  const [techStack, context, repoInstructions] = await Promise.all([
    ghClientEarly
      ? detectTechStack(ghClientEarly, repo!.owner, repo!.repo)
      : Promise.resolve(""),
    gatherEventContext(
      event.event_type,
      event.payload_raw as Record<string, unknown>,
      githubToken,
      event.repo_id ?? selectedRepo ?? undefined,
    ),
    ghClientEarly && (event.event_type === "ticket_created" || event.event_type === "issue_opened")
      ? fetchRepoInstructions(ghClientEarly, repo!.owner, repo!.repo)
      : Promise.resolve(""),
  ]);

  const systemPrompt = buildSystemPrompt(techStack || undefined, session.objective);
  const fullContext = [repoInstructions, context].filter(Boolean).join("\n\n---\n\n");
  const userPrompt = buildUserPrompt(
    session.objective,
    event.source,
    event.event_type,
    event.title ?? "Untitled",
    event.payload_raw,
    fullContext,
  );

  // Persist pre-fetched context and user prompt
  if (repoInstructions) {
    await persistStep(sessionId, -2, "tool", `[System] Repo instruction files found:\n${repoInstructions}`, undefined, undefined, undefined, "fetch_repo_instructions");
  }
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
    const maxTokens = session.objective === "plan" ? 10_000 : 4_000;

    const result = await generateText({
      model: modelConfig,
      system: systemPrompt,
      prompt: userPrompt,
      maxSteps: MAX_STEPS,
      maxTokens,
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
        maxTokens,
      });

      finalTextRaw = retryResult.text;
    }

    const parsed = parseAgentOutput(finalTextRaw);

    if (!parsed.content) {
      logger.warn({ sessionId, steps: result.steps.length }, "Agent produced no final text — marking failed");
      await db
        .update(sessionsTable)
        .set({ status: "failed", failure_reason: "empty_output", model_used: modelString, updated_at: new Date() })
        .where(eq(sessionsTable.id, sessionId));
      return;
    }

    await db
      .update(sessionsTable)
      .set({
        status: "needs_review",
        output_summary: parsed.slack_summary,
        confidence_score: parsed.confidence,
        model_used: modelString,
        updated_at: new Date(),
      })
      .where(eq(sessionsTable.id, sessionId));

    const artifactType = session.objective === "plan" ? "action_plan" : "diagnosis";
    const [insertedArtifact] = await db.insert(artifactsTable).values({
      session_id: sessionId,
      type: artifactType,
      content: parsed.content,
      approval_state: "draft",
    }).returning({ id: artifactsTable.id });

    await persistStep(sessionId, stepNum, "tool", `[Harness] Created artifact #${insertedArtifact?.id ?? "?"} (type=${artifactType}, approval=draft, ${parsed.content.length} chars)`, undefined, undefined, undefined, "create_artifact");
    stepNum++;

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
        postSlackReply(channel, threadTs, `*Analysis complete*\n${parsed.slack_summary}`, slackToken).catch((err) =>
          logger.warn({ err }, "Failed to post Slack reply"),
        );
        await persistStep(sessionId, stepNum, "tool", `[Harness] Posted Slack reply to channel ${channel} (thread ${threadTs})\n\n${parsed.slack_summary}`, undefined, undefined, undefined, "post_slack_reply");
        stepNum++;
      }
    }

    if (event.source === "linear" && event.ticket_id) {
      postLinearComment(event.ticket_id, parsed.slack_summary).catch((err) =>
        logger.warn({ err, sessionId }, "Failed to post Linear comment"),
      );
      await persistStep(sessionId, stepNum, "tool", `[Harness] Posted Linear comment to ticket ${event.ticket_id}\n\n${parsed.slack_summary}`, undefined, undefined, undefined, "post_linear_comment");
      stepNum++;
    }

    logger.info({ sessionId, model: modelString, confidence: parsed.confidence, steps: result.steps.length }, "Session completed → needs_review");
  } catch (err) {
    const reason = categorizeError(err);
    logger.error({ err, sessionId, reason }, "Agent loop failed");
    await db
      .update(sessionsTable)
      .set({ status: "failed", failure_reason: reason, updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
  }
}
