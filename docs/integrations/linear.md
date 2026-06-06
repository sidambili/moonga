# Linear Integration

Connect Moonga to Linear so new tickets from your engineering teams automatically trigger AI analysis sessions. Once the agent finishes, its findings are posted back to the ticket as a comment.

## What it does

- **Inbound**: Linear webhooks fire when issues are created in selected teams. Moonga ingests these as events and starts an agent session.
- **Outbound**: After the agent completes its analysis, Moonga posts a summary comment directly on the Linear issue.
- **Context**: The agent can read the ticket description, labels, priority, and linked project to produce source-code-grounded action plans.

## Setup

1. Go to **Settings → Integrations** in Moonga.
2. Enable the **Linear** integration.
3. Paste your **Linear API key** (create one in Linear → Settings → API).
4. Paste your **Webhook secret** (used to verify webhook signatures).
5. Enter your **engineering team names** as a comma-separated list (e.g., `Engineering, Platform, SRE`). Only issues from these teams will trigger the agent.
6. Optionally set a **default repository** (e.g., `owner/repo`). This is used for code context when a ticket has no linked GitHub repository.
7. In Linear, create a webhook pointing to your Moonga URL:
   - URL: `https://your-domain.com/api/webhooks/linear`
   - Subscribe to: `Issue` → `create` (and optionally `update`)

## How sessions work

When a ticket is created in an allowed team:
1. Linear sends a webhook to Moonga.
2. Moonga validates the team name and creates an event + session with objective `plan`.
3. The agent reads the ticket title, description, and linked repository context.
4. The agent produces an action plan (saved as an artifact).
5. Moonga posts the action plan summary as a comment on the Linear issue.

## Permissions

Your Linear API key needs the following permissions:
- `issues:read` — to fetch full ticket context
- `comments:write` — to post agent summaries back to tickets
- `teams:read` — to validate team names during setup

## Troubleshooting

| Problem | Likely cause |
|---|---|
| Tickets not creating sessions | Check that the team name in Linear exactly matches what you entered in Moonga (case-insensitive). |
| No comment posted after analysis | Verify the API key has `comments:write` and that the integration is enabled. |
| Webhooks returning 400 | Check that your webhook secret matches the one configured in Linear. |
