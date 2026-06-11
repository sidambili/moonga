import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Load .env.local then .env from the monorepo root (two levels up from lib/db/).
for (const name of [".env.local", ".env"]) {
  const p = path.resolve(__dirname, "../../", name);
  if (existsSync(p)) { process.loadEnvFile(p); break; }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set — ensure the database is provisioned");
}

export default defineConfig({
  // Relative paths: drizzle-kit prepends "./" to absolute paths, causing
  // double-slash path errors. Run all drizzle-kit commands from lib/db/.
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
