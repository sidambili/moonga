# Multi-stage build for Oncident monorepo
# Builds API server + frontend SPA, outputs a single container

# ---------------------------------------------------------------------------
# Builder stage
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

# Install pnpm (same major version as workspace lockfile)
RUN npm install -g pnpm@10

# Copy workspace manifest and lockfile first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .dockerignore ./

# Copy all package.json files so pnpm can compute the dependency graph
COPY apps/api-server/package.json apps/api-server/
COPY apps/frontend/package.json apps/frontend/
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY scripts/package.json scripts/
COPY tsconfig.base.json tsconfig.json ./

# Install dependencies (respects lockfile, downloads correct platform binaries inside container)
RUN pnpm install --frozen-lockfile

# Forward build-time env vars to the frontend build
ARG VITE_ALLOW_SIGNUP
ENV VITE_ALLOW_SIGNUP=${VITE_ALLOW_SIGNUP}

# Copy source code
COPY . .

# Build artifacts (skip typecheck — esbuild/vite don't typecheck)
RUN pnpm --filter "!@workspace/mockup-sandbox" -r --if-present run build

# ---------------------------------------------------------------------------
# Production stage
# ---------------------------------------------------------------------------
FROM node:22-slim AS production
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
WORKDIR /app
RUN chown appuser:appgroup /app

# Install curl for Docker healthchecks and pnpm for runtime dependency management
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
USER appuser

# Copy workspace files + all node_modules from builder
# We copy node_modules because esbuild bundles most code, but some packages
# (e.g. pg, dotenv) may have runtime files that are safer left unbundled.
COPY --from=builder --chown=appuser:appgroup /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder --chown=appuser:appgroup /app/apps/api-server/package.json apps/api-server/
COPY --from=builder --chown=appuser:appgroup /app/apps/frontend/package.json apps/frontend/
COPY --from=builder --chown=appuser:appgroup /app/lib/db/package.json lib/db/
COPY --from=builder --chown=appuser:appgroup /app/lib/api-zod/package.json lib/api-zod/
COPY --from=builder --chown=appuser:appgroup /app/lib/api-client-react/package.json lib/api-client-react/
COPY --from=builder --chown=appuser:appgroup /app/scripts/package.json scripts/
COPY --from=builder --chown=appuser:appgroup /app/tsconfig.base.json tsconfig.json ./
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy built artifacts
COPY --from=builder --chown=appuser:appgroup /app/apps/api-server/dist ./apps/api-server/dist
COPY --from=builder --chown=appuser:appgroup /app/apps/frontend/dist/public ./public

# Copy lib package source files (these packages export ./src/index.ts directly — no dist/)
COPY --from=builder --chown=appuser:appgroup /app/lib/api-zod/src ./lib/api-zod/src
COPY --from=builder --chown=appuser:appgroup /app/lib/api-client-react/src ./lib/api-client-react/src

# Drizzle migrations require the original TS source files (and migration metadata)
# so drizzle-kit push runs against source rather than compiled output.
# dist/ does not contain the required migration definitions.
COPY --from=builder --chown=appuser:appgroup /app/lib/db/src ./lib/db/src
COPY --from=builder --chown=appuser:appgroup /app/lib/db/drizzle.config.ts lib/db/

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_FILES_PATH=/app/public

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./apps/api-server/dist/index.mjs"]
