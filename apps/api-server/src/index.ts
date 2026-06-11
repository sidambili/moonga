import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";
import { startAgentWorker } from "./lib/agent-worker";
import { seedModelPrices } from "./lib/model-prices";
import { seedSystemPlaybooks } from "./lib/playbook-loader";
import { runMigrations } from "@workspace/db";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run pending migrations before accepting any requests. The `drizzle/` folder
// is copied next to the built bundle by build.mjs so the SQL files are present
// at runtime for both local dev and self-hosted deployments.
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "drizzle");
try {
  await runMigrations(migrationsFolder);
  logger.info("Database migrations applied");
} catch (err) {
  logger.error({ err }, "Migration failed — aborting startup");
  process.exit(1);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedModelPrices();
  } catch (seedErr) {
    logger.warn({ seedErr }, "Failed to seed model prices — continuing");
  }

  try {
    await seedSystemPlaybooks();
  } catch (seedErr) {
    logger.warn({ seedErr }, "Failed to seed system playbooks — continuing");
  }

  startAgentWorker();
});
