import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import path from "path";

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
  // Forward slashes: drizzle-kit treats this as a glob, and Windows backslashes
  // from path.join() would fail to match ("No schema files found").
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
