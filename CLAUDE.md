# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Oncident is an operations intelligence control plane. Webhooks from GitHub/Linear/Sentry/Better Stack/Slack become `Event` records, which spawn AI agent `Session`s that produce `Artifact`s (incident reports, implementation plans). Artifacts go through a human approval gate (`draft` → `approved`/`rejected`/`edited`) before any output is sent.

Session objectives are derived from event type: `diagnose` for incidents/errors/anomalies, `plan` for Linear tickets/feature requests.

## Commands

```bash
# Dev (runs api-server + frontend together, loads .env.local then .env)
node dev.mjs                                            # or: pnpm dev

# Individual services
pnpm --filter @workspace/api-server run dev             # Express API, port 5000
pnpm --filter @workspace/frontend run dev             # Vite frontend

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
- `lib/api-client-react/src/generated/` — React Query hooks + fetch client (consumed by `frontend`)
- `lib/api-zod/src/generated/` — Zod schemas + TS types (consumed by `api-server` for validation)

The `lib/` packages are compiled together by the root `tsc --build` (see `tsconfig.json` → `typecheck:libs`). The `apps/` packages typecheck independently.

**`lib/db`** (`@workspace/db`) — Drizzle ORM over Postgres. Schema in [lib/db/src/schema/](lib/db/src/schema/): `events`, `sessions`, `session_steps`, `artifacts`, `integrations`, `model_settings`, `model_prices`. Exports `db` and all `*Table` symbols from the package root. `model_settings` is a singleton table — always get-or-create, never create by ID.

**`apps/api-server`** (`@workspace/api-server`) — Express 5, ESM, bundled to a single CJS-compatible `.mjs` via esbuild ([apps/api-server/build.mjs](apps/api-server/build.mjs)). Dev script does `build` then `start` — no tsx watch mode. All routes mounted under `/api` in [apps/api-server/src/routes/index.ts](apps/api-server/src/routes/index.ts). Global `Cache-Control: no-store` is set for every response in [apps/api-server/src/app.ts](apps/api-server/src/app.ts).

The AI agent loop lives in [apps/api-server/src/lib/agent-runner.ts](apps/api-server/src/lib/agent-runner.ts) and [agent-worker.ts](apps/api-server/src/lib/agent-worker.ts) — uses Vercel `ai` SDK with OpenRouter/OpenAI providers, GitHub `Octokit` tools, model config + GitHub token pulled from the `integrations` / `model_settings` tables at runtime.

**`apps/frontend`** (`@workspace/frontend`) — React 19 + Vite + Tailwind v4 + Radix UI + wouter. Pages in [src/pages/](apps/frontend/src/pages/) (dashboard, events, sessions, artifacts, integrations, settings, plus detail pages). Capacitor configured for iOS/Android — use `vite.capacitor.config.ts` and `build:capacitor` for those.

Polling cadence (already in the code): Dashboard refetches every 30s; Events/Sessions/Artifacts every 15s.

## Conventions that bite if you miss them

- **Always regenerate before frontend edits.** If you change `openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` before touching anything in `frontend` that imports from `@workspace/api-client-react`. The codegen step also re-runs `typecheck:libs`.
- **OpenAPI body schemas must be entity-shaped, not operation-shaped.** Name them like `ArtifactEdit`, not `EditArtifactBody` — operation-shaped names cause TS2308 collisions in the generated Zod barrel.
- **Mask secrets in API responses.** Integration API keys are stored in the DB but responses show only first 4 + last 4 chars.
- **`zod/v4` is the validation API** — even though the catalog pin is `zod: ^3.25.76` (v4 ships under the `zod/v4` subpath). Prefer `drizzle-zod` for schema-derived types.
- **`minimumReleaseAge: 1440` in [pnpm-workspace.yaml](pnpm-workspace.yaml) is a supply-chain defense — do not lower or remove it.** If an exception is truly needed, add the package to `minimumReleaseAgeExclude` and remove the entry once the 1-day window has passed.
- **pnpm only.** The root `preinstall` hook deletes `package-lock.json`/`yarn.lock` and fails the install if the user agent is not pnpm.
- **The api-server `dev` script rebuilds and restarts on each invocation** — there is no watcher. Re-run it after server-side changes (or run `pnpm --filter @workspace/api-server run build` + `start` manually).

## Webhook endpoints

`POST /api/webhooks/{github,linear,sentry,betterstack,slack}` — each handler creates an Event and spawns a Session. GitHub and Linear handlers filter by action/event type (see route files for the allow-list).

## Frontend design system (locked)

All pages must follow these patterns. Do not introduce ad-hoc spacing values or one-off card styles.

### Page wrapper
Every list/detail page uses this outer container — no exceptions:
```tsx
<div className="px-5 py-5 max-w-6xl mx-auto space-y-5">
```

### Panels (sections)
All content lives inside panels. A panel is a bordered card that acts as a table/section container:
```tsx
<div className="rounded-lg border border-border bg-card overflow-hidden">
```

### Panel header
Every panel that has a title or filters uses this header bar:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b border-border">
  <div className="flex items-center gap-2">
    <span className="text-sm font-medium">Title</span>
    {/* optional count badge */}
    <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">{count}</span>
  </div>
  {/* right side: filters or actions */}
</div>
```

### Data tables
List pages render data as `<table>` elements inside panels:
- `<thead>` row: `bg-muted/30`, cells use `text-[11px] font-medium text-muted-foreground`
- `<tbody>` rows: `divide-y divide-border`, each row `hover:bg-muted/40 transition-colors cursor-pointer`
- Row navigation: `onClick={() => navigate(...)}` via `useLocation` — never wrap `<tr>` in `<Link>`
- Main content column: `max-w-0` on `<td>` + `truncate` on inner `<p>` to contain overflow
- Responsive hiding: `hidden sm:table-cell` / `hidden md:table-cell` for secondary columns
- Numbers/times: always `tabular-nums`

### Filter selects in panel header
```tsx
<Select ...>
  <SelectTrigger className="w-[120px] h-7 text-xs">
```
Use `h-7 text-xs` — never `h-9` or `h-8` in panel headers.

### Empty/loading states
```tsx
<div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
```

### Topbar
The global topbar in `Layout` (`components/layout.tsx`) derives the current page name from the `nav` array via `isActive`. It has three stub icon buttons (Search, Bell, RefreshCw) that are `disabled` until wired up. To activate one: remove `disabled`, add `onClick`, and remove the `/40` opacity class.

### Hard rules — never do these
- No `framer-motion` on page-level elements or list items
- No `backdrop-blur-sm` on cards or panels
- No gradient accent bars on stat cards (`bg-gradient-to-r from-*/60`)
- No `active:scale-[0.985]` or `active:scale-[0.99]` on list rows
- No decorative page headers (icon + uppercase label + `text-2xl h1`) — the topbar handles page identity
- No `rounded-xl border-border/60 bg-card/80` — use `rounded-lg border-border bg-card`
- No ad-hoc Tailwind values (e.g. `p-4 md:p-6`, `max-w-4xl`) — use the locked wrapper above
