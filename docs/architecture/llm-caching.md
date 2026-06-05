# LLM Caching

Oncident runs multi-step AI agent sessions where the same large prefix — system prompt, playbook, skills, and pre-fetched repository/ticket context — is resent to the model on every step of the tool loop, and again for the critic, retry, and reformat passes. That repetition is exactly what caching targets: cache the static prefix once, pay a fraction of the price (and less latency) on every subsequent call within a session.

This document explains what caching Oncident relies on, what it deliberately does **not** use, and how to verify it is working.

## TL;DR

| Layer | Status | Applies to |
|-------|--------|-----------|
| OpenRouter sticky routing (`session_id`) | **Enabled** | All OpenRouter calls |
| Provider prompt caching (DeepSeek / OpenAI / Gemini) | **Automatic** | The repeated prompt prefix |
| Cached-token cost accounting | **Enabled** | Session cost totals |
| Anthropic `cache_control` breakpoints | **Deferred** | Claude models only (~1% of runs) |
| OpenRouter response caching (`X-OpenRouter-Cache`) | **Not used** | — |
| AI SDK middleware (`wrapLanguageModel`) cache | **Not used** | — |

All caching lives in [`apps/api-server/src/lib/agent-runner.ts`](../../apps/api-server/src/lib/agent-runner.ts) (`getModelConfig`) and [`apps/api-server/src/lib/model-prices.ts`](../../apps/api-server/src/lib/model-prices.ts).

## How it works

Oncident calls models through OpenRouter via the Vercel AI SDK (`@openrouter/ai-sdk-provider`). The vast majority of runs use **DeepSeek** through OpenRouter; OpenAI is used only when a user explicitly wants a frontier reasoning model.

### 1. Provider prompt caching (the real win)

Most providers cache the **prefix** of a prompt and bill a discounted rate when a later request reuses it:

| Provider | Enablement | Cache-read price |
|----------|------------|------------------|
| DeepSeek | Automatic | ~0.1× input |
| OpenAI | Automatic (≥1,024 token prefix) | 0.25–0.5× input |
| Gemini 2.5 | Automatic (implicit) | ~0.5× input |
| Anthropic Claude | **Explicit `cache_control`** (see Deferred) | 0.1× input |

For the DeepSeek path this is **free and automatic** — no request changes are required. The only thing Oncident must do is make sure consecutive steps land on the **same upstream**, which is what sticky routing solves.

### 2. Sticky routing (`session_id`)

A model served through OpenRouter can be routed to several upstream providers. A provider's prompt cache only helps if the next request hits the *same* upstream. Oncident pins this by sending a stable per-session id:

```ts
createOpenRouter({
  extraBody: {
    session_id: `oncident-session-${sessionId}`,
    usage: { include: true },
  },
});
```

`extraBody` is forwarded directly into the OpenRouter request body. The stable `session_id` keeps OpenRouter's sticky routing on one upstream for the whole session, so the prefix cache actually hits across the 15-step loop, the critic pass, and any retries.

### 3. Cached-token cost accounting

OpenRouter reports cached prompt tokens in `usage.prompt_tokens_details.cached_tokens`. **The AI SDK provider (`@openrouter/ai-sdk-provider` 0.4.x) drops this field** — it parses only prompt and completion token counts. So Oncident reads it off the raw HTTP response with a wrapped `fetch` (`makeCaptureFetch`) that accumulates cached tokens across every call in the session.

`usage: { include: true }` is sent so OpenRouter populates the accounting details.

At the end of a session the discount is reconciled into the session totals:

- `cached_tokens` is a subset of the prompt tokens already billed at the full input rate per step, so the discount is credited back to keep `total_cost` honest.
- The cached rate is `model_prices.cached_input_rate`, falling back to `0.1 × input_rate` (the typical cache-read multiple) when no explicit rate is configured.
- Results are written to `agent_sessions.cached_tokens` and `agent_sessions.cached_cost`.

`getModelPrice()` returns `cachedInputRate` and the pricing `unit` to support this.

## What is deliberately NOT used

### Anthropic `cache_control` breakpoints — deferred

Claude does not cache automatically; it requires explicit `cache_control` breakpoints on message blocks. The OpenRouter provider only reads those breakpoints from per-message `providerMetadata` — which means moving the agent's `system` + `prompt` **strings** into a `messages` array and tagging the system message:

```ts
// Not yet implemented — sketch only
messages: [
  {
    role: "system",
    content: systemPrompt,
    providerMetadata: { openrouter: { cacheControl: { type: "ephemeral" } } },
  },
  { role: "user", content: userPrompt },
],
```

This is deferred because Claude is a small fraction of runs. Until it lands, **Anthropic models get no prompt caching** and are billed at full input rate on every step. There is a `TODO` marker at the `getModelConfig` call site.

### OpenRouter response caching (`X-OpenRouter-Cache`) — not used

OpenRouter can return a byte-identical cached response for an exact repeat request with zero billing. It is intentionally **off** because a session rerun would return the *previous* output instead of regenerating — undesirable when the point of a rerun is to reflect changed context. It only ever helps exact reruns within the TTL anyway.

### AI SDK middleware cache (`wrapLanguageModel`) — not used

A local exact-match cache (in-memory or Redis) keyed on the full request. Skipped: each event is unique, so the hit rate would be near zero, and it adds an invalidation burden (system prompt, playbook, and skills all change the key). Reconsider only if a Redis-backed exact-match layer is specifically wanted.

## Caveats and gotchas

- **Cache TTLs are short** — typically 5 minutes. Caching helps *within* a session (steps fire back-to-back) far more than *across* sessions.
- **Minimum prefix sizes apply** for automatic caching (OpenAI ≥1,024 tokens; Gemini ~2,000). Oncident's prefixes are comfortably above these, but a trivially small prompt may not cache.
- **The provider drops cache metadata.** If `@openrouter/ai-sdk-provider` is upgraded, re-check whether `prompt_tokens_details` is surfaced natively — the `makeCaptureFetch` workaround may become unnecessary.
- **Concurrent identical webhooks** are not deduplicated before hitting the model. The first of two back-to-back identical events pays full price; the second benefits only if it lands inside the cache TTL.

## Verifying it works

1. Run a session and check the server logs for the line:
   `Prompt cache hits reconciled` — it reports `cachedTokens`, `cachedCost`, and the model.
2. Inspect the session row: `agent_sessions.cached_tokens` and `cached_cost` should be non-null once a prefix has been cached and reused (i.e. from the second step onward).
3. A session with zero `cached_tokens` across many steps usually means sticky routing isn't landing on a cache-capable upstream, the model doesn't support prompt caching, or the prefix is below the provider's minimum.

## Related

- [`apps/api-server/src/lib/agent-runner.ts`](../../apps/api-server/src/lib/agent-runner.ts) — `getModelConfig`, `makeCaptureFetch`, session reconciliation
- [`apps/api-server/src/lib/model-prices.ts`](../../apps/api-server/src/lib/model-prices.ts) — `getModelPrice`, `estimateCost`
- [OpenRouter prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)
- [AI SDK middleware](https://ai-sdk.dev/docs/ai-sdk-core/middleware#caching)
