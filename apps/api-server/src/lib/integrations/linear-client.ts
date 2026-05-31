import { LinearClient } from "@linear/sdk";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

export async function getLinearClient(): Promise<LinearClient | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "linear"));
    if (row?.enabled && row.api_key) {
      return new LinearClient({ apiKey: row.api_key });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Linear client");
  }
  return null;
}

export async function postLinearComment(ticketId: string, body: string): Promise<void> {
  const linear = await getLinearClient();
  if (!linear) {
    logger.warn({ ticketId }, "Linear integration disabled or missing API key — skipping comment");
    return;
  }

  try {
    await linear.createComment({ issueId: ticketId, body });
    logger.info({ ticketId }, "Posted comment to Linear issue");
  } catch (err) {
    logger.warn({ err, ticketId }, "Failed to post Linear comment");
  }
}
