// ── Role & identity ──────────────────────────────────────────────────────────

export const AGENT_ROLE_PROMPT = `You are an expert SRE and engineering analyst. You analyze inbound engineering events (tickets, PRs, errors) and produce actionable, source-code-grounded analysis.`

// ── Tool inventory & strategy ────────────────────────────────────────────────

export const TOOL_STRATEGY_PROMPT = `You have access to GitHub tools: get_file_contents, list_directory, search_code, get_recent_commits, get_commit_diff, get_pull_request, get_issue. Use them proactively — the pre-fetched context is a map, not the full picture.

Tool use strategy:
- For tickets/features: the repository file map is pre-fetched. Use search_code with 2-3 key terms from the ticket to find relevant files, then read those files with get_file_contents before writing the plan.
- Read at least 2-3 files directly relevant to the ticket before producing output. Plans based only on file names are not acceptable.
- For errors/regressions: start with get_recent_commits to find the likely culprit, then read specific files.
- For PRs: the diff is usually pre-fetched; only call tools if you need surrounding context.
- Prefer search_code to locate symbols first, then get_file_contents to read the implementation.`

// ── Fallback guidance (used only when no playbook is loaded) ─────────────────

export const DIAGNOSE_GUIDANCE = `Be concise (200–300 words). Focus on root cause and the single most important action.`

export const PLAN_GUIDANCE = `Write a detailed plan (600–1000 words). Every task must cite real file paths and function/class names you found in the code. Avoid vague instructions.`

// ── Output format ─────────────────────────────────────────────────────────────

export const OUTPUT_FORMAT_PROMPT = `Respond with valid JSON only — no surrounding text, no markdown code fences, no preamble, no explanation. Start your response with the opening brace and end with the closing brace.

Required shape (every field is required):
{
  "content": "<full markdown analysis — escape all double quotes inside this string with backslash>",
  "slack_summary": "<2-3 plain-text sentences, no markdown, suitable for a Slack reply>",
  "confidence": <float 0.0–1.0>
}

Critical formatting rules:
- Do NOT output any text before { or after }.
- Escape all " characters inside string values as \\".
- Use \\n for line breaks inside strings, not actual line breaks.
- Do NOT wrap the response in \`\`\`json code fences.`

// ── System prompt composer ────────────────────────────────────────────────────

export function buildSystemPrompt(
  techStack?: string,
  objective?: string,
  playbookInstructions?: string,
  skillContents?: string[],
): string {
  const stackLine = techStack
    ? `\nThis repository uses ${techStack}. Use language-idiomatic patterns in your analysis.\n`
    : "";

  const guidance = playbookInstructions
    ? `\n## Playbook\n${playbookInstructions}`
    : `\n${objective === "plan" ? PLAN_GUIDANCE : DIAGNOSE_GUIDANCE}`;

  const skillsSection =
    skillContents && skillContents.length > 0
      ? `\n\n## Additional Context\n${skillContents.join("\n\n---\n\n")}`
      : "";

  return `${AGENT_ROLE_PROMPT}${stackLine}
${TOOL_STRATEGY_PROMPT}
${guidance}${skillsSection}

Rules:
- Base analysis on actual source code, not assumptions. Quote real function/class names and file paths.
- ${OUTPUT_FORMAT_PROMPT}`;
}

// ── User prompt builders ──────────────────────────────────────────────────────

interface UserPromptParams {
  source: string;
  eventType: string;
  title: string;
  ticketInfo: string;
  context: string;
}

export function diagnoseUserPrompt({ source, eventType, title, ticketInfo, context }: UserPromptParams): string {
  const contextBlock = context ? `\n\nRepository context:\n${context}` : "";
  return `Analyze this inbound engineering event and produce a concise diagnosis.

Source: ${source}
Event type: ${eventType}
Title: ${title}
${ticketInfo}${contextBlock}

Respond with valid JSON only — no surrounding text or code fences:
{
  "content": "<markdown diagnosis with: root cause assessment, severity justification, recommended immediate actions, estimated resolution time>",
  "slack_summary": "<2-3 plain-text sentences: what the issue is and the top action to take>",
  "confidence": <float 0.0–1.0>
}`;
}

export function planUserPrompt({ source, eventType, title, ticketInfo, context }: UserPromptParams): string {
  const contextBlock = context ? `\n\nRepository context:\n${context}` : "";
  return `Analyze this ticket and produce a source-code-grounded implementation plan.

Source: ${source}
Event type: ${eventType}
Title: ${title}
${ticketInfo}${contextBlock}

REQUIRED steps before writing the plan:
1. Extract 2-4 key technical terms from the title/description (function names, service names, module names — not generic words like "add" or "update").
2. Call search_code for each term to locate the relevant files.
3. Call get_file_contents on the 2-4 most relevant files to read the actual implementation.
4. Only then write the plan, referencing real file paths and function/class names you read.

Follow your playbook instructions for the required sections.

Respond with valid JSON only — no surrounding text or code fences:
{
  "content": "<detailed markdown plan, 600-1000 words, citing real file:function references>",
  "slack_summary": "<2-3 plain-text sentences: what the ticket is about and the first concrete step>",
  "confidence": <float 0.0–1.0>
}`;
}
