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
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/ops-bridge/package.json artifacts/ops-bridge/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY scripts/package.json scripts/
COPY tsconfig.base.json tsconfig.json ./

# Install dependencies (respects lockfile, downloads correct platform binaries inside container)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the workspace (typechecks + builds artifacts)
RUN pnpm run build

# ---------------------------------------------------------------------------
# Production stage
# ---------------------------------------------------------------------------
FROM node:22-slim AS production
WORKDIR /app

# Install pnpm so we can install workspace deps if needed at runtime
RUN npm install -g pnpm@10

# Copy workspace files + all node_modules from builder
# We copy node_modules because esbuild bundles most code, but some packages
# (e.g. pg, dotenv) may have runtime files that are safer left unbundled.
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=builder /app/artifacts/api-server/package.json artifacts/api-server/
COPY --from=builder /app/artifacts/ops-bridge/package.json artifacts/ops-bridge/
COPY --from=builder /app/lib/db/package.json lib/db/
COPY --from=builder /app/lib/api-zod/package.json lib/api-zod/
COPY --from=builder /app/lib/api-client-react/package.json lib/api-client-react/
COPY --from=builder /app/scripts/package.json scripts/
COPY --from=builder /app/tsconfig.base.json tsconfig.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy built artifacts
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/ops-bridge/dist/public ./public
COPY --from=builder /app/lib/api-zod/dist ./lib/api-zod/dist
COPY --from=builder /app/lib/db/src ./lib/db/src
COPY --from=builder /app/lib/db/drizzle.config.ts lib/db/

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_FILES_PATH=/app/public

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
