#!/usr/bin/env bash
# Oncident container entrypoint
# Pushes the Drizzle schema to Postgres, then starts the API server.
# This guarantees tables exist before the app accepts traffic.

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

echo "[entrypoint] Running drizzle-kit push ..."
npx drizzle-kit push --force --config ./lib/db/drizzle.config.ts

echo "[entrypoint] Starting API server ..."
exec node --enable-source-maps ./apps/api-server/dist/index.mjs
