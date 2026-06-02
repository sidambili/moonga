import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

export function extractSlackMessageInfo(payload: Record<string, unknown>): string {
  const slackEvent = payload.event as Record<string, unknown> | undefined;
  if (!slackEvent) return JSON.stringify(payload, null, 2).slice(0, 2_000);

  const rawText = (slackEvent.text as string | undefined) ?? "";
  const text = rawText.replace(/<@[A-Z0-9]+>\s*/g, "").trim();

  return [
    `Message: ${text}`,
    `Channel ID: ${(slackEvent.channel as string | undefined) ?? "unknown"}`,
    `Posted by user ID: ${(slackEvent.user as string | undefined) ?? "unknown"}`,
  ].join("\n");
}

export async function getSlackBotToken(): Promise<string | null> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "slack"));
    if (row?.enabled && row.api_key) return row.api_key;
  } catch {
    // ignore
  }
  return null;
}

export async function postSlackReply(
  channel: string,
  threadTs: string,
  text: string,
  botToken: string,
): Promise<void> {
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({ channel, thread_ts: threadTs, text, mrkdwn: true }),
  });
  const data = await resp.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? "unknown"}`);
  }
}
