# Oncident

An operations intelligence platform that acts as a control plane for GitHub, Linear, Better Stack, Sentry, Slack, and email. It receives operational events via webhooks, creates AI agent sessions, gathers context, produces drafted analysis, and routes outputs through a human approval gate before anything is sent.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/ops-bridge run dev` — run the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS (dark terminal aesthetic)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (events, sessions, artifacts, integrations, model_settings)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/ops-bridge/src/pages/` — React pages (dashboard, events, sessions, artifacts, integrations, settings)
- `artifacts/ops-bridge/src/components/` — Shared UI (layout, ui-helpers with SourceIcon/SeverityBadge/StatusBadge)

## Architecture decisions

- Events are the root unit — every webhook creates one Event record and immediately spawns one agent Session
- Sessions track AI work (pending → running → needs_review → approved/rejected/completed)
- Artifacts are the human-reviewable outputs per session — approve/reject/edit inline
- API keys stored in DB but masked in API responses (only first 4 and last 4 chars shown)
- Dashboard auto-refreshes every 30s; Events/Sessions/Artifacts refresh every 15s

## Product

**Incident flow:** Alert arrives → Event created → Session spawned → AI drafts incident report → Appears in Review Queue → Human approves/edits/rejects

**Feature request flow:** Linear ticket arrives via webhook → Event + Session created → AI drafts implementation plan → Human reviews in Review Queue

**Webhook endpoints:**
- `POST /api/webhooks/github`
- `POST /api/webhooks/linear`
- `POST /api/webhooks/sentry`
- `POST /api/webhooks/betterstack`
- `POST /api/webhooks/slack`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Body schema names in OpenAPI must be entity-shaped (e.g. `ArtifactEdit`) not operation-shaped (`EditArtifactBody`) to avoid TS2308 collision in generated Zod barrel
- After any OpenAPI spec change, always run `pnpm --filter @workspace/api-spec run codegen` before touching frontend code
- The `model_settings` table uses a singleton pattern — always get-or-create (no ID-based create)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
