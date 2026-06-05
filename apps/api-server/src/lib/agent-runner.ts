import { Octokit } from "octokit";
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { db } from "@workspace/db";
import { agentSessionsTable, agentSessionStepsTable, artifactsTable, eventsTable, integrationsTable, modelSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { estimateCost, getModelPrice } from "./model-prices";
import { gatherLinearContext, extractLinearTicketInfo } from "./integrations/linear-client";
import { extractSlackMessageInfo, getSlackBotToken, postSlackReply } from "./integrations/slack-client";
import { getRepoFromPayload, detectTechStack, fetchRepoInstructions, gatherEventContext } from "./integrations/github-context";
import { createGithubTools } from "./integrations/github-ai-tools";
import { buildSystemPrompt, diagnoseUserPrompt, planUserPrompt, CRITIC_SYSTEM_PROMPT, buildCriticPrompt } from "./ai/prompts";
import { parseAgentOutput } from "./ai/output";
import { loadPlaybook, loadActiveSkills } from "./playbook-loader";
import { emitStep } from "./session-stream";

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
  reasoning?: string,
) {
  const [row] = await db.insert(agentSessionStepsTable).values({
    session_id: sessionId,
    step_number: stepNumber,
    role: role as "user" | "assistant" | "tool",
    content: content.slice(0, 50_000) || null,
    reasoning: reasoning?.slice(0, 50_000) || null,
    tool_calls: toolCalls ?? null,
    tool_name: toolName ?? null,
    tool_result: toolResult !== undefined ? toolResult : null,
    model: model ?? null,
    tokens_used: usage?.totalTokens ?? null,
    prompt_tokens: usage?.promptTokens ?? null,
    completion_tokens: usage?.completionTokens ?? null,
    cost: usage?.cost ?? null,
  }).returning();
  if (row) emitStep(sessionId, row);
  return row;
}

// Accumulates provider-side prompt-cache hits across every LLM call in a session.
// The OpenRouter AI SDK provider (0.4.x) parses only prompt/completion token
// counts and discards usage.prompt_tokens_details — so we read cached_tokens off
// the raw HTTP response ourselves via a wrapped fetch.
interface CacheCapture {
  cachedTokens: number;
}

function makeCaptureFetch(capture: CacheCapture): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    try {
      const data = await res.clone().json();
      const cached = data?.usage?.prompt_tokens_details?.cached_tokens;
      if (typeof cached === "number") capture.cachedTokens += cached;
    } catch {
      // Non-JSON / streaming / error body — nothing to capture, leave response intact.
    }
    return res;
  };
  return wrapped;
}

function getModelConfig(
  settings: NonNullable<Awaited<ReturnType<typeof getModelSettings>>>,
  modelString: string,
  sessionId: number,
) {
  const capture: CacheCapture = { cachedTokens: 0 };
  const isOpenRouter = settings.provider === "openrouter" || (settings.base_url && settings.base_url.includes("openrouter"));
  if (isOpenRouter) {
    const openrouter = createOpenRouter({
      apiKey: settings.api_key!,
      // Prompt caching is automatic on OpenRouter for DeepSeek/OpenAI/Gemini. A
      // stable session_id keeps OpenRouter's sticky routing pinned to the same
      // upstream so the provider-side prefix cache actually hits across the
      // multi-step loop. usage.include surfaces the cached-token accounting we read
      // back in makeCaptureFetch.
      // TODO: Anthropic models need explicit cache_control breakpoints (deferred) —
      // requires moving the system/prompt strings into a messages array and tagging
      // the system message with providerMetadata.openrouter.cacheControl.
      extraBody: { usage: { include: true }, session_id: `oncident-session-${sessionId}` },
      fetch: makeCaptureFetch(capture),
    });
    return { model: openrouter.chat(modelString), capture };
  }
  const openaiProvider = createOpenAI({ apiKey: settings.api_key!, baseURL: settings.base_url ?? undefined });
  return { model: openaiProvider.chat(modelString), capture };
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
    .update(agentSessionsTable)
    .set({ status: "running", updated_at: new Date() })
    .where(eq(agentSessionsTable.id, sessionId));

  const [row] = await db
    .select({ session: agentSessionsTable, event: eventsTable })
    .from(agentSessionsTable)
    .leftJoin(eventsTable, eq(agentSessionsTable.event_id, eventsTable.id))
    .where(eq(agentSessionsTable.id, sessionId));

  if (!row?.event) {
    await db
      .update(agentSessionsTable)
      .set({ status: "failed", failure_reason: "missing_event", updated_at: new Date() })
      .where(eq(agentSessionsTable.id, sessionId));
    logger.warn({ sessionId }, "Session has no associated event — marked failed");
    return;
  }

  const settings = await getModelSettings();
  if (!settings?.api_key) {
    await db
      .update(agentSessionsTable)
      .set({ status: "failed", failure_reason: "missing_api_key", updated_at: new Date() })
      .where(eq(agentSessionsTable.id, sessionId));
    logger.warn({ sessionId }, "No API key in model settings — session marked failed");
    return;
  }

  const { session, event } = row;
  const modelString =
    session.objective === "plan"
      ? (settings.plan_model ?? "deepseek/deepseek-v4-pro")
      : (settings.triage_model ?? "deepseek/deepseek-v4-flash");

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

  const [playbook, activeSkills] = await Promise.all([
    loadPlaybook(session.objective, event.source).catch(() => undefined),
    loadActiveSkills().catch(() => []),
  ]);

  const systemPrompt = buildSystemPrompt(
    techStack || undefined,
    session.objective,
    playbook?.instructions,
    activeSkills.map((s) => s.content),
  );

  if (playbook) {
    await db
      .update(agentSessionsTable)
      .set({ playbook_id: playbook.id, updated_at: new Date() })
      .where(eq(agentSessionsTable.id, sessionId));
  }

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

  const { model: modelConfig, capture: cacheCapture } = getModelConfig(settings, modelString, sessionId);
  const sessionStartTime = Date.now();

  try {
    const maxTokens = session.objective === "plan" ? 10_000 : 4_000;

    let stepNum = 1;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let toolCallsCount = 0;

    const result = await generateText({
      model: modelConfig,
      system: systemPrompt,
      prompt: userPrompt,
      maxSteps: MAX_STEPS,
      maxTokens,
      temperature: 0,
      tools: createGithubTools(ghClient, repo, checkToolLimit),
      onStepFinish: async (step) => {
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
          await persistStep(sessionId, stepNum, "assistant", step.text ?? "", modelString, stepUsage, step.toolCalls as unknown[], undefined, step.reasoning ?? undefined);
        }

        for (const tr of step.toolResults ?? []) {
          await persistStep(sessionId, stepNum, "tool", String(tr.result ?? "No result"), modelString, undefined, undefined, tr.toolName, tr.result);
        }

        stepNum++;
      },
    });

    let finalTextRaw = result.text;
    let retryUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

    // Fallback: some providers/models don't produce text after tool results.
    // Retry without tools using structured output to guarantee valid JSON.
    if (!finalTextRaw && result.steps.some((s) => s.toolCalls && s.toolCalls.length > 0)) {
      const toolResults = result.steps.flatMap((s) => s.toolResults ?? []);
      const retryPrompt = `${userPrompt}\n\n[Tool results gathered]\n${toolResults
        .map((tr) => `Tool: ${tr.toolName}\nResult: ${JSON.stringify(tr.result).slice(0, 10_000)}`)
        .join("\n---\n")}\n\nBased on the above tool results, produce your final analysis now.`;

      const retryResult = await generateObject({
        model: modelConfig,
        system: systemPrompt,
        prompt: retryPrompt,
        schema: z.object({
          content: z.string().describe("Full markdown analysis"),
          slack_summary: z.string().describe("2-3 plain-text sentences suitable for Slack"),
          confidence: z.number().min(0).max(1),
        }),
        maxTokens,
      });

      finalTextRaw = JSON.stringify(retryResult.object);
      retryUsage = retryResult.usage;
    }

    // Add retry usage to aggregates
    if (retryUsage) {
      totalPromptTokens += retryUsage.promptTokens;
      totalCompletionTokens += retryUsage.completionTokens;
      totalTokens += retryUsage.totalTokens;
      const retryCost = await estimateCost(modelString, {
        promptTokens: retryUsage.promptTokens,
        completionTokens: retryUsage.completionTokens,
      });
      totalCost += retryCost;
    }

    const modelPrice = await getModelPrice(modelString);
    const durationMs = Date.now() - sessionStartTime;

    let parsed = parseAgentOutput(finalTextRaw);

    // If parsing failed but we have raw text, attempt a reformat with structured output
    if (!parsed && finalTextRaw) {
      logger.warn({ sessionId, rawLength: finalTextRaw.length }, "Agent output parse failed — attempting reformat");
      try {
        const reformat = await generateObject({
          model: modelConfig,
          system: "You are a JSON extraction assistant. Given raw analyst output that may contain preamble text or malformed JSON, extract the content, slack_summary, and confidence into valid JSON. Preserve all markdown content exactly.",
          prompt: `Reformat this raw analyst output into the required JSON shape.\n\nRaw text:\n${finalTextRaw}`,
          schema: z.object({
            content: z.string(),
            slack_summary: z.string(),
            confidence: z.number().min(0).max(1),
          }),
          maxTokens: 4096,
        });
        parsed = reformat.object;
        if (reformat.usage) {
          totalPromptTokens += reformat.usage.promptTokens;
          totalCompletionTokens += reformat.usage.completionTokens;
          totalTokens += reformat.usage.totalTokens;
          const reformatCost = await estimateCost(modelString, {
            promptTokens: reformat.usage.promptTokens,
            completionTokens: reformat.usage.completionTokens,
          });
          totalCost += reformatCost;
        }
        await persistStep(sessionId, stepNum, "tool", "[System] Reformat parse-failed output into structured JSON", modelString, undefined, undefined, "reformat_output");
        stepNum++;
      } catch (reformatErr) {
        logger.error({ err: reformatErr, sessionId }, "Reformat attempt also failed");
      }
    }

    if (!parsed?.content) {
      logger.warn({ sessionId, steps: result.steps.length }, "Agent produced no final text — marking failed");
      await db
        .update(agentSessionsTable)
        .set({ status: "failed", failure_reason: "empty_output", model_used: modelString, updated_at: new Date() })
        .where(eq(agentSessionsTable.id, sessionId));
      return;
    }

    // Adversarial critic pass — a fresh, skeptical review of the plan before it
    // reaches the human gate. Advisory only: a critic failure never fails the
    // session. Runs here (before the totals UPDATE) so its tokens are counted.
    let criticReview: string | null = null;
    let criticUsage: { promptTokens: number; completionTokens: number; totalTokens: number; cost: number } | undefined;
    let criticVerdict: string | null = null;
    let criticFailed: string | null = null;
    try {
      // Plain text, not structured output: a truncated markdown review is still
      // readable, whereas truncated JSON throws NoObjectGeneratedError and loses
      // the whole review.
      const critic = await generateText({
        model: modelConfig,
        system: CRITIC_SYSTEM_PROMPT,
        prompt: buildCriticPrompt(ticketInfo, parsed.content),
        temperature: 0,
        // Generous budget: reasoning models spend most tokens "thinking" and only
        // then emit the answer. Too low a cap = finishReason "length" with empty text.
        maxTokens: 4_000,
      });
      // Fall back to reasoning content when a reasoning model emits no final text.
      criticReview = (critic.text.trim() || critic.reasoning?.trim() || "") || null;
      criticVerdict = criticReview?.match(/verdict:\s*(ship|revise|reject)/i)?.[1]?.toLowerCase() ?? null;
      if (critic.usage) {
        const cost = await estimateCost(modelString, {
          promptTokens: critic.usage.promptTokens,
          completionTokens: critic.usage.completionTokens,
        });
        criticUsage = {
          promptTokens: critic.usage.promptTokens,
          completionTokens: critic.usage.completionTokens,
          totalTokens: critic.usage.totalTokens,
          cost,
        };
        totalPromptTokens += criticUsage.promptTokens;
        totalCompletionTokens += criticUsage.completionTokens;
        totalTokens += criticUsage.totalTokens;
        totalCost += cost;
      }
      if (criticReview) {
        logger.info(
          { sessionId, verdict: criticVerdict, finishReason: critic.finishReason, tokens: criticUsage?.totalTokens, cost: criticUsage?.cost },
          "Critic pass complete",
        );
      } else {
        criticFailed = `critic produced no text (finishReason=${critic.finishReason})`;
        logger.warn({ sessionId, finishReason: critic.finishReason, tokens: criticUsage?.totalTokens }, "Critic pass produced no review");
      }
    } catch (criticErr) {
      criticFailed = criticErr instanceof Error ? criticErr.message : String(criticErr);
      logger.warn({ err: criticErr, sessionId }, "Critic pass failed — continuing without review");
    }

    // Reconcile provider-side prompt-cache savings. cached_tokens is a subset of
    // the prompt tokens already billed at full input rate in the per-step
    // estimateCost above, so credit back the discount to keep total_cost honest.
    // Fall back to 0.1x input rate — the typical cache-read multiple — when the
    // model has no explicit cached_input_rate.
    const cachedTokens = cacheCapture.cachedTokens;
    let cachedCost: number | null = null;
    if (cachedTokens > 0) {
      const divisor = modelPrice.unit === "1K" ? 1_000 : 1_000_000;
      const cachedRate = modelPrice.cachedInputRate ?? modelPrice.inputRate * 0.1;
      cachedCost = parseFloat(((cachedTokens / divisor) * cachedRate).toFixed(6));
      const savings = (cachedTokens / divisor) * (modelPrice.inputRate - cachedRate);
      totalCost = Math.max(0, parseFloat((totalCost - savings).toFixed(6)));
      logger.info({ sessionId, cachedTokens, cachedCost, model: modelString }, "Prompt cache hits reconciled");
    }

    await db
      .update(agentSessionsTable)
      .set({
        status: "needs_review",
        output_summary: parsed.slack_summary,
        confidence_score: parsed.confidence,
        model_used: modelString,
        total_tokens: totalTokens || null,
        total_prompt_tokens: totalPromptTokens || null,
        total_completion_tokens: totalCompletionTokens || null,
        total_cost: totalCost || null,
        cached_tokens: cachedTokens || null,
        cached_cost: cachedCost,
        prompt_token_cost: modelPrice.inputRate,
        completion_token_cost: modelPrice.outputRate,
        tool_calls_count: toolCallsCount || null,
        step_count: result.steps.length || null,
        duration_ms: durationMs || null,
        updated_at: new Date(),
      })
      .where(eq(agentSessionsTable.id, sessionId));

    const artifactType = session.objective === "plan" ? "action_plan" : "diagnosis";
    const [insertedArtifact] = await db.insert(artifactsTable).values({
      session_id: sessionId,
      type: artifactType,
      content: parsed.content,
      approval_state: "draft",
      // Inherit tenant scope from the parent session.
      project_id: session.project_id,
    }).returning({ id: artifactsTable.id });

    await persistStep(sessionId, stepNum, "tool", `[System] Created artifact #${insertedArtifact?.id ?? "?"} (type=${artifactType}, approval=draft, ${parsed.content.length} chars)`, undefined, undefined, undefined, "create_artifact");
    stepNum++;

    if (criticReview) {
      await persistStep(sessionId, stepNum, "tool", `[System] Plan review (adversarial critic)\n\n${criticReview}`, modelString, criticUsage, undefined, "critic_review", { verdict: criticVerdict });
      stepNum++;
    } else if (criticFailed) {
      await persistStep(sessionId, stepNum, "tool", `[System] Plan review skipped — critic pass failed: ${criticFailed}`, modelString, undefined, undefined, "critic_review", { success: false, error: criticFailed });
      stepNum++;
    }

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

    logger.info({ sessionId, model: modelString, confidence: parsed.confidence, steps: result.steps.length }, "Session completed → needs_review");
  } catch (err) {
    const reason = categorizeError(err);
    logger.error({ err, sessionId, reason }, "Agent loop failed");
    await db
      .update(agentSessionsTable)
      .set({ status: "failed", failure_reason: reason, updated_at: new Date() })
      .where(eq(agentSessionsTable.id, sessionId));
  }
}
