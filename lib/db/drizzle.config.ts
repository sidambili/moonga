import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Load the monorepo-root .env so `drizzle-kit push` works without a per-package
// copy. This file always lives at lib/db/, so the root is two levels up.
const rootEnv = path.resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Absolute paths so drizzle-kit resolves relative to this config file rather
  // than CWD — critical when commands are run from the repo root in production.
  schema: path.resolve(__dirname, "./src/schema/index.ts"),
  out: path.resolve(__dirname, "./drizzle"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
