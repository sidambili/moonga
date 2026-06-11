import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { startAgentWorker } from "./lib/agent-worker";
import { seedModelPrices } from "./lib/model-prices";
import { seedSystemPlaybooks } from "./lib/playbook-loader";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Migrations are NOT run here. They are applied once as a dedicated pre-start
// step (src/migrate.ts, invoked by the Docker entrypoint) so they never race
// across multiple booting instances. The server assumes the schema is current.

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
