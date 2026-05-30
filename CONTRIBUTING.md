# Contributing

## Workspace setup

This is a pnpm workspace. Use `pnpm` for all package operations. The root `package.json` blocks npm and yarn.

```bash
pnpm install
```

## Workflow

### OpenAPI-first changes

The API contract lives in `lib/api-spec/openapi.yaml`. If you change it:

1. Edit `openapi.yaml`
2. Regenerate types and hooks:
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```
3. Only then update frontend code that depends on the new schemas.

### Database schema changes

Drizzle schema files live in `lib/db/src/schema/`. After editing:

```bash
pnpm --filter @workspace/db run push
```

This applies schema changes in development. The `model_settings` table uses a singleton pattern — always get-or-create, never ID-based create.

### TypeScript and validation

- Use `zod/v4` for runtime validation.
- Use `drizzle-zod` for schema-derived types where possible.
- Run the full typecheck before committing:
  ```bash
  pnpm run typecheck
  ```

### Supply-chain security

The workspace enforces `minimumReleaseAge: 1440` (1 day) for all npm packages. Do not remove or lower this setting. If you need an urgent exception for a trusted package, add it to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` and remove it once the window has passed.

### Code style

- Prettier is configured at the root. Run it via your editor or:
  ```bash
  pnpm exec prettier --write .
  ```
- Keep error handling explicit in route handlers.
- Mask sensitive values (API keys, secrets) in API responses — show only first 4 and last 4 characters.

## Testing

Build and typecheck the entire workspace before opening a PR:

```bash
pnpm run build
```

## Commit messages

Use clear, imperative-style commit messages that describe what the change does:

- `feat: add Slack webhook handler`
- `fix: correct severity detection for Sentry fatal events`
- `refactor: extract ingestWebhook into shared helper`
