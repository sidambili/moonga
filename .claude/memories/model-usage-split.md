---
name: model-usage-split
description: Which LLM providers/models Oncident actually runs in practice
metadata:
  type: project
---

~99% of Oncident agent runs go through **OpenRouter with DeepSeek** (or other open-source models); only ~1% use OpenAI, and only when a user specifically wants GPT-5.5 with high/xhigh thinking effort. GPT-4.x is considered obsolete and is not used.

**Why:** Design decisions for the agent loop (`apps/api-server/src/lib/agent-runner.ts`) should optimize for the DeepSeek-via-OpenRouter path, not OpenAI. E.g. caching work prioritized OpenRouter sticky routing (DeepSeek's prompt cache is automatic), and Anthropic `cache_control` was deferred as a 1% concern.

**How to apply:** Default model fallbacks are `deepseek/deepseek-v4-pro` (plan) and `deepseek/deepseek-v4-flash` (triage). Don't lean on "OpenAI caching is automatic" reasoning for features. LLM caching design follows from this and is documented at `docs/architecture/llm-caching.md`.
