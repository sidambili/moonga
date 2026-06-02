/**
 * Loads the monorepo-root `.env` into `process.env`.
 *
 * `drizzle-kit` and `tsx` do not auto-load a `.env`, and even the tools that do
 * only look in the package's own directory. This walks up from this file to the
 * nearest `.env` (the repo root in practice) and loads it, so DB scripts work no
 * matter which directory they're invoked from. No copying `.env` per package.
 *
 * Import this FIRST, before anything that reads `process.env.DATABASE_URL`.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findEnv(start: string): string | undefined {
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined; // reached filesystem root
    dir = parent;
  }
}

const envPath = findEnv(path.dirname(fileURLToPath(import.meta.url)));
if (envPath) {
  // Node 20.12+/22 built-in; does not override vars already in the environment.
  process.loadEnvFile(envPath);
}
