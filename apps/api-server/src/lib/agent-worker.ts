import { db } from "@workspace/db";
import { agentSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { runAgentSession } from "./agent-runner";

const POLL_INTERVAL_MS = 10_000;

async function pollPendingSessions(): Promise<void> {
  try {
    const pending = await db
      .select()
      .from(agentSessionsTable)
      .where(eq(agentSessionsTable.status, "pending"))
      .limit(5);

    await Promise.all(
      pending.map(async (session) => {
        try {
          await runAgentSession(session.id);
        } catch (err) {
          logger.error({ err, sessionId: session.id }, "Failed to process session");
          try {
            await db
              .update(agentSessionsTable)
              .set({ status: "failed", updated_at: new Date() })
              .where(eq(agentSessionsTable.id, session.id));
          } catch (dbErr) {
            logger.error({ dbErr }, "Failed to mark session as failed");
          }
        }
      }),
    );
  } catch (err) {
    logger.error({ err }, "Agent worker poll error");
  }
}

export function startAgentWorker(): void {
  logger.info("Agent worker started — polling every 10s for pending sessions");
  void pollPendingSessions();
  setInterval(() => void pollPendingSessions(), POLL_INTERVAL_MS);
}
