# Oncident

An operations intelligence platform that acts as a control plane for GitHub, Linear, Better Stack, Sentry, Slack, and email. It receives operational events via webhooks, creates AI agent sessions, gathers context, produces drafted analysis, and routes outputs through a human approval gate before anything is sent.

## How it works

1. **Ingest** — Webhooks arrive from connected tools.
2. **Event** — Each webhook becomes an `Event` record with extracted metadata (source, type, severity, title).
3. **Session** — Every event spawns an AI `Session` with an objective:
   - `diagnose` for incidents, errors, and anomalies
   - `plan` for Linear tickets and feature requests
4. **Artifact** — The AI drafts an output (incident report, implementation plan, etc.).
5. **Review** — Artifacts land in a human review queue with states: `draft` → `approved` / `rejected` / `edited`.
6. **Resolution** — Approved/rejected artifacts finalize the session status.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS (dark terminal aesthetic)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Prerequisites

- Node.js 24+
- pnpm
- PostgreSQL 16+
- `DATABASE_URL` environment variable set

## Quick start

```bash
# Install dependencies
pnpm install

# Push the database schema (dev only)
pnpm --filter @workspace/db run push

# Start the API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Start the frontend (in another terminal)
pnpm --filter @workspace/frontend run dev
```

## Webhook endpoints

Configure your tools to send webhooks to:

- `POST /api/webhooks/github`
- `POST /api/webhooks/linear`
- `POST /api/webhooks/sentry`
- `POST /api/webhooks/betterstack`
- `POST /api/webhooks/slack`

## Project structure

```
lib/
  api-spec/openapi.yaml      # Single source of truth for API contracts
  db/src/schema/             # Drizzle table definitions
  api-zod/                   # Generated Zod schemas
  api-client-react/          # Generated React Query hooks

apps/
  api-server/src/routes/     # Express route handlers
  frontend/src/pages/      # React pages
  frontend/src/components/ # Shared UI components
```

## Self-hosting

The easiest way to deploy is with Docker Compose on a VPS.

### One-command deploy

```bash
# On your VPS (Ubuntu/Debian)
export REPO_URL=https://github.com/YOUR_USER/YOUR_REPO.git
export DOMAIN=your-domain.com  # optional, for HTTPS
bash deploy/vps-setup.sh
```

The script will install Docker, clone the repo, generate secrets, build, and start everything.

### Manual Docker Compose

```bash
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD and BETTER_AUTH_SECRET
docker compose up -d
```

The API container automatically pushes the database schema on startup, so no manual migration step is needed.

### Creating the first user

Sign-up is enabled by default so you can create your first account immediately after deploying.

1. Open the app and register your account.
2. After creating your account, set `ALLOW_SIGNUP=false` and `VITE_ALLOW_SIGNUP=false` in `.env`.
3. Rebuild and redeploy to close registration:
   ```bash
   docker compose up -d --build
   ```

## Important conventions

- After any OpenAPI spec change, regenerate client code before touching frontend code:
  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```
- The workspace enforces a 1-day minimum release age for npm packages (supply-chain defense). Do not disable this.
- Body schema names in OpenAPI must be entity-shaped (e.g. `ArtifactEdit`) to avoid TypeScript collisions in generated Zod barrels.
