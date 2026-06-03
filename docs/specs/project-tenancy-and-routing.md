# Spec: Multi-tenancy, Projects & Webhook Source Routing

**Status:** Phase 1 shipped · Phase 1.5 (pickers) next · Phase 2 (connections) planned
**Audience:** anyone — PM, senior, or junior dev. Read "Vision" + "Domain model" for the
why; "Current state" for what exists; "Roadmap" for what to build next and how.
**Last updated:** 2026-06-02

---

## 1. Vision & guiding principle

Oncident is an operations-intelligence control plane: webhooks (Linear, GitHub, Sentry,
Slack, Better Stack) become `Event`s, which spawn AI `Session`s, which produce `Artifact`s
(incident reports, plans) that a human approves before anything is sent.

We are **not** building a developer platform — those exist. We are building the thing that
saves a busy operator time. The whole product thesis is:

> **See it → click it → it works.** No copying IDs, no pasting webhook payloads, no
> "I missed a digit and spent an hour debugging." If a step requires a human to hand-transcribe
> a machine identifier, that step is a bug in the design.

Concretely, this principle drives one near-term decision (Section 6.1): **never make a user type
a Linear team id or GitHub repo name** — we already hold the credentials, so we fetch the list
and let them pick from a dropdown.

Treat that principle as a hard requirement, not a nicety. When in doubt, remove a field.

---

## 2. Domain model & vocabulary

The single most important idea: **separate identity/credentials (who) from routing/bindings
(where data goes).** Conflating them is the root cause of the limitation we're unwinding.

| Term | What it is | Scoped to | Real-world analogy |
|------|-----------|-----------|--------------------|
| **Organization** | A tenant boundary. Holds membership, billing, and shared credentials. The thing you switch between in the topbar. | — (top level) | A company / a Linear workspace account |
| **Project** | A unit of work *inside* an org. Operational data is grouped under it; external resources bind to it. | Organization | A software product / a service |
| **Member** | A user's role (`owner`/`admin`/`member`) within an org. | Organization | A teammate |
| **Connection** *(Phase 2)* | A provider credential (Linear token, GitHub install, Slack bot). One per provider per org; a single connection can see many repos/teams. | Organization | "Our Linear login" |
| **Project Source** *(binding)* | A mapping from an external resource (Linear team id, GitHub `owner/repo`) to a project. Pure routing — **no credential**. | Project | "Issues from team ENG belong to the Web project" |

### How a webhook finds its home

```
Inbound webhook ─► extract external id (Linear team id / GitHub repo full_name)
                 ─► project_sources lookup on (provider, external_id)
                      ├─ hit  ─► that project_id            ◄── this is the whole point
                      └─ miss ─► integration's org ─► org's default project
                 ─► stamp event.project_id + session.project_id
```

### Why this solves the three pains the operator hit

1. **Two GitHub repos for two projects** → two `project_source` rows. Each event lands in the
   right project with the right repo context. (Previously impossible: a single global
   integration meant one repo's worth of context for everything.)
2. **Multiple Linear accounts for different orgs** → one **organization** each, each with its
   own credential. Switch orgs in the topbar; full isolation. (Phase 2 removes the last blocker
   here — see Section 5.1.)
3. **"What even is a project?"** → A project is the bucket that gives *Software 1* and
   *Software 2* separate event streams / dashboards / approval queues, even though they share
   one Linear workspace and one set of teammates.

---

## 3. Current state — what is built (Phase 1)

A map of the implemented system, with the files a dev should open.

### 3.1 Tenancy schema & provisioning
- `lib/db/src/schema/organizations.ts` — better-auth `organization` / `member` / `invitation`
  tables (auth-managed; do **not** rename JS keys).
- `lib/db/src/schema/projects.ts` — `projects` table (`organization_id`, `name`, `slug`).
- `lib/db/src/schema/auth.ts` — better-auth `user`/`session`/`account`. `session` carries
  `activeOrganizationId` (better-auth) **and** `activeProjectId` (ours).
- `lib/db/src/tenancy.ts` — `provisionDefaultTenancy` (every new user gets a personal `"Default"`
  org + default project + owner membership), `getUserPrimaryOrgId`, `getOrgDefaultProjectId`,
  `uniqueOrgSlug`. Re-exported from the package barrel.
- `lib/db/src/backfill-tenancy.ts` — one-time idempotent migration that puts pre-tenancy
  users/data into a shared `"default"` org (`pnpm --filter @workspace/db run backfill`).
- `apps/api-server/src/lib/auth.ts` — better-auth `databaseHooks`: stamps a new user's tenancy
  on `user.create`; stamps `activeOrganizationId` + `activeProjectId` on `session.create`.
  `activeProjectId` is declared as a session `additionalField` so `getSession` surfaces it.

### 3.2 Operational data & tenant columns
- `events`, `sessions`, `artifacts` each have a nullable `project_id`
  (`lib/db/src/schema/{events,sessions,artifacts}.ts`). NULL = "not yet routed" and stays
  visible (migration-safe).

### 3.3 Read-scoping (filter what a request can see)
- `apps/api-server/src/lib/require-auth.ts` — exposes `res.locals.{userId, sessionId,
  activeOrganizationId, activeProjectId}` from the session.
- `apps/api-server/src/lib/tenant-scope.ts` — `tenantScope(res, col)` / `withTenantScope(...)`:
  scopes a query to projects belonging to the active **org** (NULL `project_id` deliberately
  included so unrouted rows remain visible). Used by `routes/{events,sessions,artifacts}.ts`.
  **Note:** scoping is currently **org-level**, not project-level (Section 5.3).

### 3.4 Write-scoping (stamp tenant on new data)
- `apps/api-server/src/routes/webhooks.ts` — `resolveWebhookProjectId(source, payload)`:
  binding lookup → org-default fallback (Section 2 diagram). `extractSourceExternalId` reads the
  Linear team id / GitHub repo. `ingestWebhook` stamps both event and session.
- `apps/api-server/src/lib/agent-runner.ts` — the artifact insert inherits `project_id` from its
  parent session (the event→session→artifact chain shares one tenant).

### 3.5 Project Sources (bindings)
- `lib/db/src/schema/project-sources.ts` — `project_sources(project_id, provider, external_id,
  label)` with `UNIQUE(provider, external_id)` (deterministic routing).
- `apps/api-server/src/routes/project-sources.ts` — `GET/POST /project-sources`,
  `DELETE /project-sources/:id`. Authz: org membership for reads, owner/admin for writes; every
  row reachable only via a project in the active org. `409` on duplicate mapping.
- Frontend: **Project Sources** panel in
  `apps/frontend/src/components/settings/organization-section.tsx`.

### 3.6 Tenant UI
- `apps/frontend/src/components/org-switcher.tsx` — topbar org dropdown (better-auth
  `setActive`).
- `apps/frontend/src/components/project-switcher.tsx` — topbar project picker (uses
  `useListProjects` / `useActivateProject`; `POST /projects/{id}/activate`).
- `apps/frontend/src/pages/settings.tsx` — Model / Organization sub-nav.
- `apps/frontend/src/components/settings/organization-section.tsx` — org rename, projects
  (list/create/rename/switch), members + invitations, project sources.

### 3.7 Already-existing provider listing endpoints (important for Phase 1.5)
These exist today and are the key to the "click it" UX:
- `GET /api/integrations/github/repos` → `[{ id, full_name, name, owner, private }]`
  (`apps/api-server/src/routes/integrations.ts`, via Octokit).
- `GET /api/integrations/linear/teams` → `[{ id, name }]` (via `getLinearClient()`).
- Generated hooks: `useListIntegrationRepos`, `useListIntegrationTeams`
  (`@workspace/api-client-react`).

---

## 4. Authorization model (read before touching any route)

This codebase does **not** use RBAC tables. The authz model is **tenant ownership**:

- Every protected router is mounted under `requireAuth` in
  `apps/api-server/src/routes/index.ts`.
- Each handler additionally gates with `apps/api-server/src/lib/org-access.ts`:
  `getActiveMembership(res)` (reads need membership) and `canManageOrg(membership)` (writes need
  owner/admin).
- Every query is scoped to `res.locals.activeOrganizationId`, which better-auth guarantees is an
  org the user belongs to. A resource id from another org must 404, never act.
- Webhook routes are **public** (no `requireAuth`) and verify a per-source signature/secret
  inside the handler.

Follow this exact shape for new routes — see `routes/projects.ts` and `routes/project-sources.ts`
as the reference implementations.

---

## 5. Known limitations / gaps (the "why" for the roadmap)

### 5.1 One credential per provider, globally (the big one)
`integrations.provider` is `UNIQUE` (`lib/db/src/schema/integrations.ts`) — there can be exactly
**one** `github` / `linear` row in the entire database. So:
- Truly separate Linear accounts for different orgs can't each hold their own token yet.
- Webhook credential/secret is shared, not per-org.
> Fix = Phase 2 (Section 6.2): split `integrations` into org-scoped **connections**.

### 5.2 Sources require hand-typed IDs (violates the product principle)
The Project Sources panel currently has a free-text `external_id` field. Asking an operator to
find and paste a Linear team UUID is exactly the failure mode the product exists to kill.
> Fix = Phase 1.5 (Section 6.1): replace the text field with a **picker** fed by the existing
> `/integrations/*/teams` and `/integrations/*/repos` endpoints. **This is the next thing to build.**

### 5.3 Read-scoping is org-level, not project-level
`tenant-scope.ts` filters to all projects in the active org; switching the **project** in the
topbar changes `session.activeProjectId` but does not yet narrow what lists show.
> Fix = Section 6.3: extend `tenantScope` to optionally filter by `activeProjectId`.

### 5.4 Only Linear + GitHub have routing keys
`extractSourceExternalId` returns `undefined` for Sentry/Slack/Better Stack, so they fall back to
the org default project.
> Fix = Section 6.4: add a key extractor per source as each becomes relevant.

### 5.5 New integrations may not stamp `organization_id`
The org-default fallback relies on `integrations.organization_id` being populated. Backfill set it
for existing rows; verify the integration-create path stamps it.
> Fix = Section 6.5: stamp `organization_id` on integration upsert.

### 5.6 No per-connection webhook URLs
All webhooks hit one global path (`/api/webhooks/linear`). Identification relies on the singleton
integration. Per-connection URLs (`/api/webhooks/linear/:connectionId`) make org resolution O(1)
and give each connection its own secret.
> Fix = Phase 2 (Section 6.2).

---

## 6. Roadmap — what to build, why, where, and "done" criteria

### 6.1 Phase 1.5 — Clickable source picker  ◄ DO THIS NEXT

**Why.** Section 5.2 / the product principle. The operator must never type an ID.

**What.** In the **Project Sources** add-row
(`apps/frontend/src/components/settings/organization-section.tsx`, `ProjectSourcesPanel`):
replace the free-text `external_id` `Input` with a **searchable dropdown**:
- Provider = Linear → load teams via `useListIntegrationTeams("linear")` → options are
  `{ value: team.id, label: team.name }`.
- Provider = GitHub → load repos via `useListIntegrationRepos("github")` → options are
  `{ value: repo.full_name, label: repo.full_name }`.
- On select, set BOTH `external_id` (the machine id) **and** `label` (the human name)
  automatically. The user sees names; the id is filled behind the scenes.
- Use the existing `Command`/`Popover` combobox primitives
  (`apps/frontend/src/components/ui/{command,popover}.tsx`) — there is already a dropdown pattern
  in `project-switcher.tsx` to mirror.

**Files.**
- `apps/frontend/src/components/settings/organization-section.tsx` — swap the input for the
  combobox; wire the two hooks; keep the manual field only as a hidden fallback if a fetch fails
  (e.g. no credential configured) so the panel still works.
- No backend change — the endpoints in Section 3.7 already return exactly what's needed.

**Gotchas.**
- These endpoints need a configured credential (they 400/503 without one). Handle the empty/error
  state: show "Connect Linear/GitHub in Integrations first" instead of an empty dropdown.
- Both endpoints key off the singleton integration today; that's fine until Phase 2.

**Done when.** An operator opens Project Sources, picks "Linear", sees their real team names in a
dropdown, clicks one, picks a project, clicks **Map** — and a new Linear issue from that team
creates an event stamped with the right `project_id`. Zero characters typed.

---

### 6.2 Phase 2 — Connections (credential ⇄ binding split)

**Why.** Section 5.1 / 5.6 — enables multiple provider accounts per/ across orgs and per-org
secrets.

**What.**
1. Schema: rename/replace `integrations` → `connections`, **drop the global `UNIQUE(provider)`**,
   key by `(organization_id, provider)` (or a plain id allowing multiples). Add `connection_id`
   to `project_sources`. (`lib/db/src/schema/` + `drizzle-kit push`; no migration files —
   dev-only.)
2. Routing: per-connection webhook URLs `/api/webhooks/:provider/:connectionId`; keep the old
   global routes as a fallback that resolves to the default org so nothing breaks mid-migration.
   Each connection has its own `webhook_secret`.
3. Webhook resolution: identify connection from the path → org; then `project_sources` lookup
   (now `(connection_id, external_id)`); fall back to that connection's org default project.
4. Frontend: split integrations UI into **org-level Connections** (credentials) + the existing
   **per-project Sources** (bindings).

**Files.** `lib/db/src/schema/{integrations→connections,project-sources}.ts`,
`apps/api-server/src/routes/{webhooks,integrations}.ts`, `apps/api-server/src/lib/integrations/`,
frontend integrations + settings.

**Complexity.** Medium. Mostly additive + a data migration of existing integration rows into
connections; the heavier half is the connections-management UI. Backend routing barely changes
from Phase 1.

**Done when.** Two orgs can each hold their own Linear token; a webhook is routed to the correct
org purely by its URL, then to the correct project by binding.

---

### 6.3 Project-level read-scoping (optional, when projects multiply)

**Why.** Section 5.3 — make the topbar project switcher actually narrow lists.

**What.** Extend `tenant-scope.ts` to optionally `AND` on `activeProjectId` when present (keep an
"all projects in org" mode for org-wide views like the dashboard). Decide per-page whether it
respects the active project.

**Files.** `apps/api-server/src/lib/tenant-scope.ts` + the list routes that should honor it.

**Done when.** Switching project filters Events/Sessions/Artifacts to that project; org-wide
dashboards still aggregate across the org.

---

### 6.4 More source routing keys (Sentry / Slack / Better Stack)

**What.** Add cases to `extractSourceExternalId` (`routes/webhooks.ts`): Sentry → project slug,
Slack → channel/team id, Better Stack → monitor/source id. Add matching provider options to the
source picker.

**Done when.** Each provider's webhooks route to a project by binding, same as Linear/GitHub.

---

### 6.5 Stamp `organization_id` on integration/connection create

**What.** Ensure the integration upsert path writes `organization_id = activeOrganizationId`
(`routes/integrations.ts`). Otherwise the org-default fallback silently yields NULL.

**Done when.** A freshly created integration resolves to its org's default project on fallback.

---

### 6.6 Slack as an opt-in output (later, per operator)

Slack is a *communication* surface, not an ingestion source for routing. Model it as a per-project
(or per-artifact-approval) **toggle**: "when an artifact is approved here, post the summary to
Slack channel X." Lives downstream of the approval gate; out of scope for routing. Capture as a
separate spec when prioritized.

---

## 7. Conventions & gotchas (project-wide)

- **OpenAPI is the source of truth.** Edit `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @workspace/api-spec run codegen` **before** touching frontend code that imports
  `@workspace/api-client-react`. Body schema names must be **entity-shaped** (`ProjectSourceCreate`,
  not `CreateProjectSourceBody`) or the generated Zod barrel collides (TS2308).
- **DB changes** use `pnpm --filter @workspace/db run push` (dev only; no migrations directory).
- **No test runner.** Correctness gate is `pnpm run build` (typecheck + per-package build).
- **api-server has no watcher** — its `dev` script rebuilds+restarts. Re-run after server edits.
- **Place code by dependency direction:** isomorphic dependency-free helpers → `@workspace/utils`;
  DB-coupled business logic → `@workspace/db` (e.g. `tenancy.ts`); keep auth hooks and route
  handlers thin.
- **Frontend design system is locked** (see `CLAUDE.md`): page wrapper
  `px-5 py-5 max-w-6xl mx-auto space-y-5`; panels `rounded-lg border border-border bg-card`;
  panel-header selects `h-7/h-8 text-xs`. No ad-hoc card styles, no `framer-motion` on lists.
- **New protected route?** Gate with `requireAuth` + an `org-access` ownership check (Section 4).
- **Mask secrets** in API responses (first 4 + last 4 chars).

---

## 8. Glossary (one-liners)

- **Organization** — tenant; what you switch between; holds members + credentials.
- **Project** — work bucket inside an org; what operational data is grouped by.
- **Connection** *(Phase 2)* — a provider credential, org-scoped.
- **Project Source / binding** — external resource → project mapping; pure routing, no credential.
- **Read-scoping** — filtering queries by tenant (`tenant-scope.ts`).
- **Write-scoping** — stamping `project_id` on newly created rows (`webhooks.ts`, `agent-runner.ts`).
- **`activeOrganizationId` / `activeProjectId`** — the caller's current tenant, on the session.
