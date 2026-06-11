#!/usr/bin/env bash
# Oncident container entrypoint
# Applies Drizzle migrations to Postgres, then starts the API server.
# This guarantees the schema is current before the app accepts traffic.

set -e

DB_HOST=$(node -e "const u = new URL(process.env.DATABASE_URL); console.log(u.hostname)")
DB_PORT=$(node -e "const u = new URL(process.env.DATABASE_URL); console.log(u.port || 5432)")

echo "[entrypoint] Waiting for Postgres at ${DB_HOST}:${DB_PORT} ..."
for i in {1..30}; do
  if bash -c "exec 3<>/dev/tcp/${DB_HOST}/${DB_PORT}" 2>/dev/null; then
    echo "[entrypoint] Postgres is reachable."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[entrypoint] ERROR: Postgres did not become reachable in time."
    exit 1
  fi
  sleep 2
done

# Baseline-aware migration runner (single authority). Unlike raw `drizzle-kit
# migrate`, this baselines existing push-built databases so it never tries to
# re-create tables that already exist. Safe on both fresh and existing DBs.
echo "[entrypoint] Applying database migrations ..."
node --enable-source-maps ./apps/api-server/dist/migrate.mjs

echo "[entrypoint] Starting API server ..."
exec node --enable-source-maps ./apps/api-server/dist/index.mjs
