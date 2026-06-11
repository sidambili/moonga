import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runMigrations, pool } from "@workspace/db";

// Standalone, baseline-aware migration runner. This is the single authority for
// applying migrations on a deployment: the Docker entrypoint runs it once before
// the API server starts. runMigrations() baselines existing push-built databases
// so migrate() only applies incremental migrations (never re-runs 0000).
//
// The drizzle/ folder is copied next to this bundle by build.mjs.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "drizzle",
);

try {
  await runMigrations(migrationsFolder);
  console.log("[migrate] Database migrations applied");
  await pool.end();
} catch (err) {
  console.error("[migrate] Migration failed:", err);
  await pool.end().catch(() => {});
  process.exit(1);
}
