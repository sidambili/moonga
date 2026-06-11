<div align="center">

# Moonga

**Linear issues → implementation plans. Duplicate detection, critic pass, human review gate.**

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg) ![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)

[Why](#why) • [Screenshots](#screenshots) • [How it works](#how-it-works) • [Self-Hosting](#self-hosting) • [Local Dev](#local-dev) • [Contributing](#contributing)

---
</div>

> Some internal names (database, env files) still say `oncident` — same project, earlier name.

---

## Why

When I'm ready to start on a ticket, I used to run a skill manually: pull the issue, cross-check for duplicates or related work in Linear, then sit down to write a plan. The plan would go to AI, come back overengineered, and I'd have to cut it down before it was usable. Then I'd post it back to the issue and assign it.

That whole sequence is now automated. Moonga handles the grunt work so the plan I'm reviewing is already scoped down, already cross-checked against existing issues, and already pushed back on by a second agent before it gets to me.

I manage a few different products, each with their own repos and Linear accounts. Most agentic planning tools are built for a single team on a single codebase — you can't connect multiple repos or multiple Linear workspaces, so you end up context-switching between tools anyway. Moonga is built around that multi-project reality.

The other thing that was missing: most tools give you no visibility into what the agent actually did. Debugging a bad plan means guessing. Here, every session has full agent traces. Token usage and cost are tracked too — not something most people need, but it's there if you care about it or want to tune model choices per workflow.

---

## How it works

```
Linear issue created
        │
        ▼
Scans for duplicates and related issues in Linear
        │
        ▼
Pulls repository context from GitHub
        │
        ▼
Drafts an implementation plan
        │
        ▼
Critic agent reviews the draft — flags gaps, bad assumptions, and overengineering
        │
        ▼
Plan is revised against the critique
        │
        ▼
Human review gate — approve, reject, or edit
        │
        ▼
Approved plan posted back to the Linear issue, ready to assign
```

Nothing posts without approval.

---

## What comes out

Each plan includes a summary of what the request actually means, scope boundaries, relevant files from repo analysis, ordered implementation steps, risks and edge cases, and handoff notes.

The critic pass is specifically there to catch overengineering — AI defaults to building the general case when the specific case is fine. The critic flags that before you see it, so you're reviewing a plan that's already been reined in, not starting from scratch on a bloated draft.

---

## Screenshots

**Plan view**

![Plan view](apps/landing/public/plan.png)

**Critic pass**

![Critic pass](apps/landing/public/critic-review.png)

**Integrations**

![Integrations](apps/landing/public/integrations.png)

**Playbooks**

![Playbooks](apps/landing/public/playbooks.png)

---

## Also in the box

The same ingest pipeline handles webhooks from Sentry, Better Stack, GitHub, and Slack — those spawn `diagnose` sessions that draft incident summaries through the same review gate. It works, but the Linear → plan workflow is the core thing.

---

## Self-hosting

Moonga is self-hosted only. There's no managed cloud option (unless there's enough demand for it).

### Models

Works with OpenRouter, so you can use any model — including DeepSeek and other open/Chinese models. Bring your own API key; costs depend on your setup and model choices. Most agentic tools lock you to one provider and don't expose model settings — here you configure them per workflow.

### Docker Compose

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD and BETTER_AUTH_SECRET at minimum
docker compose up -d
```

The API container applies database migrations on startup, before serving traffic. The runner is baseline-aware, so it's safe on both fresh installs and existing databases (including ones originally created with `drizzle-kit push`) — it never re-creates tables that already exist.

### VPS

```bash
export REPO_URL=https://github.com/YOUR_USER/YOUR_REPO.git
export DOMAIN=your-domain.com   # optional, enables HTTPS
bash deploy/vps-setup.sh
```

Installs Docker, clones the repo, generates secrets, builds, and starts everything.

### First user

Sign-up is open by default.

1. Open the app and register.
2. Set `ALLOW_SIGNUP=false` and `VITE_ALLOW_SIGNUP=false` in `.env`.
3. Rebuild:
   ```bash
   docker compose up -d --build
   ```

---

## Local dev

```bash
pnpm install
pnpm db:push   # quick local setup — pushes the schema to a THROWAWAY dev DB
pnpm dev
```

Requires Node.js 22+, pnpm, PostgreSQL 16+, and `DATABASE_URL` in your env.

`db:push` is a convenience for a local database you don't mind losing. **Never run it against a shared or production database** — it can drop columns and tables. Schema changes that ship are made via committed migrations (`pnpm --filter @workspace/db run generate`); see [CONTRIBUTING.md](CONTRIBUTING.md#database-schema-changes).

---

## Stack

- pnpm workspaces, Node.js 22 LTS, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild

---

## Webhook endpoints

- `POST /api/webhooks/linear`
- `POST /api/webhooks/github`
- `POST /api/webhooks/sentry`
- `POST /api/webhooks/betterstack`
- `POST /api/webhooks/slack`

---

## Project structure

```
lib/
  api-spec/openapi.yaml      # API contract — edit here first
  db/src/schema/             # Drizzle table definitions
  api-zod/                   # Generated Zod schemas
  api-client-react/          # Generated React Query hooks

apps/
  api-server/src/routes/     # Express route handlers
  frontend/src/pages/        # React pages
  frontend/src/components/   # Shared UI components
```

After changing `openapi.yaml`, regenerate before touching any frontend code:

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Contributing

Built to solve a real workflow problem. If your team has the same one, feedback from actual usage is especially useful. Issues and pull requests welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

MIT
