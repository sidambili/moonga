import { Octokit } from "octokit";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { db } from "@workspace/db";
import { sessionsTable, sessionStepsTable, artifactsTable, eventsTable, integrationsTable, modelSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { estimateCost, getModelPrice } from "./model-prices";
import { postLinearComment, gatherLinearContext, extractLinearTicketInfo } from "./integrations/linear-client";
import { extractSlackMessageInfo, getSlackBotToken, postSlackReply } from "./integrations/slack-client";
import { getRepoFromPayload, detectTechStack, fetchRepoInstructions, gatherEventContext } from "./integrations/github-context";
import { createGithubTools } from "./integrations/github-ai-tools";
import { buildSystemPrompt, diagnoseUserPrompt, planUserPrompt } from "./ai/prompts";
import { parseAgentOutput } from "./ai/output";

const MAX_STEPS = 15;
const MAX_TOOL_CALLS = 30;

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

  // Fetch tech stack, event context, repo instruction files, and Linear context in parallel
  const [techStack, context, repoInstructions, linearContext] = await Promise.all([
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
    event.source === "linear" && event.ticket_id
      ? gatherLinearContext(event.ticket_id)
      : Promise.resolve(""),
  ]);

  const systemPrompt = buildSystemPrompt(techStack || undefined, session.objective);
  const fullContext = [repoInstructions, linearContext, context].filter(Boolean).join("\n\n---\n\n");

  const ticketInfo = event.source === "linear"
    ? extractLinearTicketInfo(event.payload_raw as Record<string, unknown>)
    : event.source === "slack"
    ? extractSlackMessageInfo(event.payload_raw as Record<string, unknown>)
    : JSON.stringify(event.payload_raw, null, 2).slice(0, 2_000);

  const userPrompt = session.objective === "plan"
    ? planUserPrompt({ source: event.source, eventType: event.event_type, title: event.title ?? "Untitled", ticketInfo, context: fullContext })
    : diagnoseUserPrompt({ source: event.source, eventType: event.event_type, title: event.title ?? "Untitled", ticketInfo, context: fullContext });

  // Persist pre-fetched context and user prompt
  if (repoInstructions) {
    await persistStep(sessionId, -3, "tool", `[System] Repo instruction files found:\n${repoInstructions}`, undefined, undefined, undefined, "fetch_repo_instructions");
  }
  if (linearContext) {
    await persistStep(sessionId, -2, "tool", `[System] Linear ticket context:\n${linearContext}`, undefined, undefined, undefined, "gather_linear_context");
  }
  if (context) {
    await persistStep(sessionId, -1, "tool", `[System] Pre-fetched repository context:\n${context}`, undefined, undefined, undefined, "gather_event_context");
  }
  await persistStep(sessionId, 0, "user", userPrompt);

  const ghClient = repo && githubToken ? new Octokit({ auth: githubToken }) : null;

  let toolCallsUsed = 0;
  function checkToolLimit(): string | null {
    if (++toolCallsUsed > MAX_TOOL_CALLS) {
      return "Tool call limit reached. Write your final answer using the information gathered so far.";
    }
    return null;
  }

  const modelConfig = getModelConfig(settings, modelString);
  const sessionStartTime = Date.now();

  try {
    const maxTokens = session.objective === "plan" ? 10_000 : 4_000;

    const result = await generateText({
      model: modelConfig,
      system: systemPrompt,
      prompt: userPrompt,
      maxSteps: MAX_STEPS,
      maxTokens,
      tools: createGithubTools(ghClient, repo, checkToolLimit),
    });

    // Accumulate session aggregates while persisting steps
    let stepNum = 1;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let toolCallsCount = 0;

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

      if (stepUsage) {
        totalPromptTokens += stepUsage.promptTokens;
        totalCompletionTokens += stepUsage.completionTokens;
        totalTokens += stepUsage.totalTokens;
        totalCost += stepUsage.cost;
      }
      toolCallsCount += step.toolCalls?.length ?? 0;

      if (step.text || (step.toolCalls && step.toolCalls.length > 0)) {
        await persistStep(sessionId, stepNum, "assistant", step.text ?? "", modelString, stepUsage, step.toolCalls as unknown[]);
      }

      for (const tr of step.toolResults ?? []) {
        await persistStep(sessionId, stepNum, "tool", String(tr.result ?? "No result"), modelString, undefined, undefined, tr.toolName, tr.result);
      }

      stepNum++;
    }

    let finalTextRaw = result.text;
    let retryResult: Awaited<ReturnType<typeof generateText>> | undefined;

    // Fallback: some providers/models don't produce text after tool results.
    // Retry without tools, feeding the tool results back as context.
    if (!finalTextRaw && result.steps.some((s) => s.toolCalls && s.toolCalls.length > 0)) {
      const toolResults = result.steps.flatMap((s) => s.toolResults ?? []);
      const retryPrompt = `${userPrompt}\n\n[Tool results gathered]\n${toolResults
        .map((tr) => `Tool: ${tr.toolName}\nResult: ${JSON.stringify(tr.result).slice(0, 10_000)}`)
        .join("\n---\n")}\n\nBased on the above tool results, produce your final analysis now.`;

      retryResult = await generateText({
        model: modelConfig,
        system: systemPrompt,
        prompt: retryPrompt,
        maxTokens,
      });

      finalTextRaw = retryResult.text;
    }

    // Add retry usage to aggregates
    if (retryResult?.usage) {
      totalPromptTokens += retryResult.usage.promptTokens;
      totalCompletionTokens += retryResult.usage.completionTokens;
      totalTokens += retryResult.usage.totalTokens;
      const retryCost = await estimateCost(modelString, {
        promptTokens: retryResult.usage.promptTokens,
        completionTokens: retryResult.usage.completionTokens,
      });
      totalCost += retryCost;
    }

    const modelPrice = await getModelPrice(modelString);
    const durationMs = Date.now() - sessionStartTime;

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
        total_tokens: totalTokens || null,
        total_prompt_tokens: totalPromptTokens || null,
        total_completion_tokens: totalCompletionTokens || null,
        total_cost: totalCost || null,
        prompt_token_cost: modelPrice.inputRate,
        completion_token_cost: modelPrice.outputRate,
        tool_calls_count: toolCallsCount || null,
        step_count: result.steps.length || null,
        duration_ms: durationMs || null,
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

    await persistStep(sessionId, stepNum, "tool", `[System] Created artifact #${insertedArtifact?.id ?? "?"} (type=${artifactType}, approval=draft, ${parsed.content.length} chars)`, undefined, undefined, undefined, "create_artifact");
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
        try {
          await postSlackReply(channel, threadTs, `*Analysis complete*\n${parsed.slack_summary}`, slackToken);
          await persistStep(sessionId, stepNum, "tool", `[System] Posted Slack reply to channel ${channel} (thread ${threadTs})\n\n${parsed.slack_summary}`, undefined, undefined, undefined, "post_slack_reply", { success: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ err }, "Failed to post Slack reply");
          await persistStep(sessionId, stepNum, "tool", `[System] Failed to post Slack reply: ${msg}`, undefined, undefined, undefined, "post_slack_reply", { success: false, error: msg });
        }
        stepNum++;
      }
    }

    if (event.source === "linear" && event.ticket_id) {
      try {
        await postLinearComment(event.ticket_id, parsed.slack_summary);
        await persistStep(sessionId, stepNum, "tool", `[System] Posted Linear comment to ticket ${event.ticket_id}\n\n${parsed.slack_summary}`, undefined, undefined, undefined, "post_linear_comment", { success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err, sessionId }, "Failed to post Linear comment");
        await persistStep(sessionId, stepNum, "tool", `[System] Failed to post Linear comment: ${msg}`, undefined, undefined, undefined, "post_linear_comment", { success: false, error: msg });
      }
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
