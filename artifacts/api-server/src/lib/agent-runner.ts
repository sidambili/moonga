import OpenAI from "openai";
import { Octokit } from "octokit";
import { db } from "@workspace/db";
import { sessionsTable, sessionStepsTable, artifactsTable, eventsTable, integrationsTable, modelSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { executeToolCalls, type ToolCall, type ToolResult } from "./github-tools";
import { GITHUB_TOOLS } from "./github-tools";

const MAX_STEPS = 10;
const MAX_PAYLOAD_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 15_000;

function extractKeywords(payload: Record<string, unknown>): string[] {
  const data = payload.data as Record<string, unknown> | undefined;
  const title = (data?.title as string) ?? "";
  const description = (data?.description as string) ?? "";
  const text = `${title} ${description}`.toLowerCase();
  // Filter out common stop words, keep meaningful tokens
  const stopWords = new Set(["the", "a", "an", "in", "on", "at", "to", "for", "of", "with", "and", "or", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them", "my", "your", "his", "her", "its", "our", "their", "fix", "bug", "issue", "error", "problem", "feature", "request"]);
  const tokens = text
    .replace(/[^a-z0-9_\-/\.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));
  // Deduplicate and limit
  return Array.from(new Set(tokens)).slice(0, 8);
}

async function fetchFileContent(
  client: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const { data } = await client.rest.repos.getContent({ owner, repo, path });
    if (Array.isArray(data)) return null;
    if ("content" in data && typeof data.content === "string") {
      const decoded = Buffer.from(data.content, "base64").toString("utf8");
      return decoded;
    }
  } catch (err) {
    logger.warn({ err, path }, "Failed to fetch file content");
  }
  return null;
}

interface StepRecord {
  role: "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  tool_result?: unknown;
}

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
      // 1. Fetch README
      try {
        const readmeContent = await fetchFileContent(client, owner, repoName, "README.md");
        if (readmeContent) {
          parts.push(`README.md:\n${readmeContent.slice(0, 3_000)}`);
        }
      } catch (err) {
        parts.push(`Could not fetch README: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 2. Extract keywords and find relevant source files
      const keywords = extractKeywords(payload);
      if (keywords.length > 0) {
        parts.push(`Keywords extracted from ticket: ${keywords.join(", ")}`);
        try {
          const { data: tree } = await client.rest.git.getTree({ owner, repo: repoName, tree_sha: "HEAD", recursive: "1" });
          const matchingFiles = tree.tree
            .filter((e): e is typeof e & { path: string } => e.type === "blob" && typeof e.path === "string")
            .filter((e) => keywords.some((k) => e.path.toLowerCase().includes(k)))
            .slice(0, 10);

          if (matchingFiles.length > 0) {
            parts.push("Relevant source files:");
            for (const f of matchingFiles) {
              const content = await fetchFileContent(client, owner, repoName, f.path);
              if (content) {
                parts.push(`--- ${f.path} ---\n${content.slice(0, 2_500)}`);
              } else {
                parts.push(`--- ${f.path} --- (could not fetch content)`);
              }
            }
          } else {
            parts.push("No source files matched the extracted keywords.");
          }
        } catch (err) {
          parts.push(`Could not search repo tree: ${err instanceof Error ? err.message : String(err)}`);
        }
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
  record: StepRecord,
  model?: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number },
) {
  await db.insert(sessionStepsTable).values({
    session_id: sessionId,
    step_number: stepNumber,
    role: record.role,
    content: record.content ?? null,
    tool_calls: record.tool_calls ? record.tool_calls as unknown[] : null,
    tool_call_id: record.tool_call_id ?? null,
    tool_name: record.tool_name ?? null,
    tool_result: record.tool_result ? record.tool_result as unknown[] : null,
    model: model ?? null,
    tokens_used: usage?.total_tokens ?? null,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    cost: usage?.cost ?? null,
  });
}

async function fetchOpenRouterCost(
  genId: string,
  apiKey: string,
  baseUrl: string,
): Promise<number | undefined> {
  try {
    const url = baseUrl.replace(/\/?$/, "").replace(/\/v1$/, "") + `/api/v1/generation?id=${encodeURIComponent(genId)}`;
    logger.debug({ url, genId }, "Fetching OpenRouter cost");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://oncident.io" },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, statusText: res.statusText, genId }, "OpenRouter cost fetch failed");
      return undefined;
    }
    const data = await res.json() as { data?: { total_cost?: number } };
    logger.debug({ genId, cost: data.data?.total_cost }, "OpenRouter cost fetched");
    return data.data?.total_cost;
  } catch (err) {
    logger.warn({ err, genId }, "Failed to fetch OpenRouter cost");
    return undefined;
  }
}

function buildToolsDescription(): string {
  const lines = GITHUB_TOOLS.map((t) => {
    const fn = t.function;
    const props = (fn.parameters.properties ?? {}) as Record<string, { description?: string }>;
    const required = (fn.parameters.required ?? []) as string[];
    const params = Object.entries(props)
      .map(([k, v]) => `${k}${required.includes(k) ? "" : "?"}: ${v.description || "string"}`)
      .join(", ");
    return `- ${fn.name}(${params}) — ${fn.description}`;
  });
  return lines.join("\n");
}

function buildSystemPrompt(): string {
  const toolsDesc = buildToolsDescription();
  return `You are an expert SRE and engineering analyst with access to GitHub repository tools.

Available tools:
${toolsDesc}

When you need to use one or more tools, output them as a single JSON code block like this:
\`\`\`json
[
  {"name": "tool_name", "arguments": {"key": "value"}}
]
\`\`\`

After receiving tool results, provide your final diagnosis or plan directly in plain text.
Be concise. Avoid unnecessary tool calls. If the provided event payload is sufficient, answer directly.`;
}

function buildInitialMessages(
  objective: string,
  source: string,
  eventType: string,
  title: string,
  payload: unknown,
  context: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const payloadStr = JSON.stringify(payload, null, 2).slice(0, MAX_PAYLOAD_CHARS);
  const contextBlock = context ? `\n\nRepository context:\n${context}` : "";

  let userPrompt: string;
  if (objective === "diagnose") {
    userPrompt = `Analyze this inbound engineering event and produce a concise diagnosis.

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
  } else {
    userPrompt = `Analyze this ticket/task and produce an action plan.

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

  return [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: userPrompt },
  ];
}

function parseToolCallsFromText(text: string): ToolCall[] | null {
  const blockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!blockMatch) return null;
  try {
    const parsed = JSON.parse(blockMatch[1]) as Array<{ name: string; arguments: Record<string, unknown> }>;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item, idx) => ({
      id: `call_${idx}_${Date.now()}`,
      type: "function" as const,
      function: {
        name: item.name,
        arguments: JSON.stringify(item.arguments),
      },
    }));
  } catch {
    return null;
  }
}

function parseOutput(text: string): { summary: string; confidence: number } {
  const match = text.match(/CONFIDENCE:\s*([\d.]+)\s*$/im);
  const confidence = match
    ? Math.min(1, Math.max(0, parseFloat(match[1])))
    : 0.75;
  const summary = text.replace(/CONFIDENCE:\s*[\d.]+\s*$/im, "").trim();
  return { summary, confidence };
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
  const model =
    session.objective === "plan"
      ? (settings.plan_model ?? "gpt-4o")
      : (settings.triage_model ?? "gpt-4o-mini");

  const client = new OpenAI({
    apiKey: settings.api_key,
    baseURL: settings.base_url ?? undefined,
    defaultHeaders: settings.base_url ? { "HTTP-Referer": "https://oncident.io" } : undefined,
  });

  const githubToken = await getGithubToken();

  // Pre-fetch repository context based on event type
  const context = await gatherEventContext(
    event.event_type,
    event.payload_raw as Record<string, unknown>,
    githubToken,
    event.repo_id ?? undefined,
  );

  const messages = buildInitialMessages(
    session.objective,
    event.source,
    event.event_type,
    event.title ?? "Untitled",
    event.payload_raw,
    context,
  );

  // Persist the initial user message as step 0
  await persistStep(sessionId, 0, {
    role: "user",
    content: messages[messages.length - 1].content as string,
  });

  // Persist gathered context as step -1 (before user prompt)
  if (context) {
    await persistStep(sessionId, -1, {
      role: "tool",
      content: `[System] Pre-fetched repository context:\n${context}`,
      tool_name: "gather_event_context",
    });
  }

  let stepCount = 0;
  let finalText = "";
  let finalConfidence = 0.75;

  try {
    while (stepCount < MAX_STEPS) {
      stepCount++;

      const completion = await client.chat.completions.create({
        model,
        messages,
        max_tokens: 4096,
      });

      const choice = completion.choices[0];
      const assistantText = choice.message.content ?? "";
      const usage = completion.usage;

      let cost: number | undefined;
      if (settings.base_url && completion.id) {
        cost = await fetchOpenRouterCost(completion.id, settings.api_key, settings.base_url);
      }

      const usageRecord = {
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        total_tokens: usage?.total_tokens,
        cost,
      };

      // Parse tool calls from text response
      const toolCalls = parseToolCallsFromText(assistantText);

      // Persist assistant message (stripping tool block for readability)
      const displayText = assistantText.replace(/```json\s*[\s\S]*?\s*```/g, "[tool calls omitted]").trim();
      await persistStep(sessionId, stepCount, {
        role: "assistant",
        content: displayText || assistantText,
        tool_calls: toolCalls ?? undefined,
      }, model, usageRecord);

      if (toolCalls && toolCalls.length > 0) {
        // Execute tools
        const toolResults = await executeToolCalls(
          toolCalls,
          githubToken,
          event.payload_raw as Record<string, unknown>,
        );

        // Add assistant message to conversation (full text with tool block)
        messages.push({
          role: "assistant",
          content: assistantText,
        });

        // Build tool results as a user message
        let resultText = "Tool results:\n";
        for (const tr of toolResults) {
          const matchingCall = toolCalls.find((tc) => tc.id === tr.tool_call_id);
          const name = matchingCall?.function?.name ?? "unknown";
          resultText += `\n--- ${name} ---\n${tr.content}\n`;

          await persistStep(sessionId, stepCount, {
            role: "tool",
            content: tr.content,
            tool_call_id: tr.tool_call_id,
            tool_name: name,
            tool_result: tr,
          });
        }
        messages.push({ role: "user", content: resultText });
      } else {
        // Final answer — no tool calls
        finalText = assistantText;
        const parsed = parseOutput(finalText);
        finalText = parsed.summary;
        finalConfidence = parsed.confidence;
        break;
      }
    }

    if (stepCount >= MAX_STEPS) {
      logger.warn({ sessionId }, "Agent reached max steps without final answer");
      finalText = finalText || "Analysis stopped after reaching the maximum number of reasoning steps.";
    }
  } catch (err) {
    logger.error({ err, sessionId }, "Agent loop failed");
    await db
      .update(sessionsTable)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    return;
  }

  // Update session with final result
  await db
    .update(sessionsTable)
    .set({
      status: "needs_review",
      output_summary: finalText,
      confidence_score: finalConfidence,
      model_used: model,
      updated_at: new Date(),
    })
    .where(eq(sessionsTable.id, sessionId));

  // Create artifact
  const artifactType = session.objective === "plan" ? "action_plan" : "diagnosis";
  await db.insert(artifactsTable).values({
    session_id: sessionId,
    type: artifactType,
    content: finalText,
    approval_state: "draft",
  });

  // Update event status
  await db
    .update(eventsTable)
    .set({ status: "needs_review" })
    .where(eq(eventsTable.id, event.id));

  logger.info({ sessionId, model, confidence: finalConfidence, steps: stepCount }, "Session completed → needs_review");
}
