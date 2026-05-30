# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Oncident is an operations intelligence control plane. Webhooks from GitHub/Linear/Sentry/Better Stack/Slack become `Event` records, which spawn AI agent `Session`s that produce `Artifact`s (incident reports, implementation plans). Artifacts go through a human approval gate (`draft` → `approved`/`rejected`/`edited`) before any output is sent.

Session objectives are derived from event type: `diagnose` for incidents/errors/anomalies, `plan` for Linear tickets/feature requests.

## Commands

```bash
# Dev (runs api-server + ops-bridge together, loads .env.local then .env)
node dev.mjs                                            # or: pnpm dev

# Individual services
pnpm --filter @workspace/api-server run dev             # Express API, port 5000
pnpm --filter @workspace/ops-bridge run dev             # Vite frontend

# Full check / build
pnpm run typecheck                                      # libs (tsc --build) + per-package
pnpm run build                                          # typecheck + recursive build

# Regenerate API client + Zod from OpenAPI (always run after editing openapi.yaml,
# before touching frontend code that uses the generated types)
pnpm --filter @workspace/api-spec run codegen

# DB schema sync (dev only — no migrations directory; drizzle-kit push)
pnpm --filter @workspace/db run push
pnpm --filter @workspace/db run push-force             # destructive; only when intended

# Formatting (no lint task; prettier only)
pnpm exec prettier --write .
```

There is no test runner configured. The "test" for correctness is `pnpm run build` (typecheck + per-package build).

Required env: `DATABASE_URL` (Postgres). Loaded from `.env.local` (preferred) or `.env` by `dev.mjs`.

## Architecture

This is a pnpm workspace. Three layers:

**`lib/api-spec/openapi.yaml`** is the single source of truth for API contracts. Orval generates two sibling packages from it:
- `lib/api-client-react/src/generated/` — React Query hooks + fetch client (consumed by `ops-bridge`)
- `lib/api-zod/src/generated/` — Zod schemas + TS types (consumed by `api-server` for validation)

The `lib/` packages are compiled together by the root `tsc --build` (see `tsconfig.json` → `typecheck:libs`). The `artifacts/` packages typecheck independently.

**`lib/db`** (`@workspace/db`) — Drizzle ORM over Postgres. Schema in [lib/db/src/schema/](lib/db/src/schema/): `events`, `sessions`, `session_steps`, `artifacts`, `integrations`, `model_settings`, `model_prices`. Exports `db` and all `*Table` symbols from the package root. `model_settings` is a singleton table — always get-or-create, never create by ID.

**`artifacts/api-server`** (`@workspace/api-server`) — Express 5, ESM, bundled to a single CJS-compatible `.mjs` via esbuild ([artifacts/api-server/build.mjs](artifacts/api-server/build.mjs)). Dev script does `build` then `start` — no tsx watch mode. All routes mounted under `/api` in [artifacts/api-server/src/routes/index.ts](artifacts/api-server/src/routes/index.ts). Global `Cache-Control: no-store` is set for every response in [artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts).

The AI agent loop lives in [artifacts/api-server/src/lib/agent-runner.ts](artifacts/api-server/src/lib/agent-runner.ts) and [agent-worker.ts](artifacts/api-server/src/lib/agent-worker.ts) — uses Vercel `ai` SDK with OpenRouter/OpenAI providers, GitHub `Octokit` tools, model config + GitHub token pulled from the `integrations` / `model_settings` tables at runtime.

**`artifacts/ops-bridge`** (`@workspace/ops-bridge`) — React 19 + Vite + Tailwind v4 + Radix UI + wouter. Pages in [src/pages/](artifacts/ops-bridge/src/pages/) (dashboard, events, sessions, artifacts, integrations, settings, plus detail pages). Capacitor configured for iOS/Android — use `vite.capacitor.config.ts` and `build:capacitor` for those.

Polling cadence (already in the code): Dashboard refetches every 30s; Events/Sessions/Artifacts every 15s.

## Conventions that bite if you miss them

- **Always regenerate before frontend edits.** If you change `openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before touching anything in `ops-bridge` that imports from `@workspace/api-client-react`. The codegen step also re-runs `typecheck:libs`.
- **OpenAPI body schemas must be entity-shaped, not operation-shaped.** Name them like `ArtifactEdit`, not `EditArtifactBody` — operation-shaped names cause TS2308 collisions in the generated Zod barrel.
- **Mask secrets in API responses.** Integration API keys are stored in the DB but responses show only first 4 + last 4 chars.
- **`zod/v4` is the validation API** — even though the catalog pin is `zod: ^3.25.76` (v4 ships under the `zod/v4` subpath). Prefer `drizzle-zod` for schema-derived types.
- **`minimumReleaseAge: 1440` in [pnpm-workspace.yaml](pnpm-workspace.yaml) is a supply-chain defense — do not lower or remove it.** If an exception is truly needed, add the package to `minimumReleaseAgeExclude` and remove the entry once the 1-day window has passed.
- **pnpm only.** The root `preinstall` hook deletes `package-lock.json`/`yarn.lock` and fails the install if the user agent is not pnpm.
- **The api-server `dev` script rebuilds and restarts on each invocation** — there is no watcher. Re-run it after server-side changes (or run `pnpm --filter @workspace/api-server run build` + `start` manually).

## Webhook endpoints

`POST /api/webhooks/{github,linear,sentry,betterstack,slack}` — each handler creates an Event and spawns a Session. GitHub and Linear handlers filter by action/event type (see route files for the allow-list).
