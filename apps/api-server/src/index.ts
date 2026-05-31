import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { startAgentWorker } from "./lib/agent-worker";
import { seedModelPrices } from "./lib/model-prices";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
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

  startAgentWorker();
});
