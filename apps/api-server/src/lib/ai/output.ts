export interface AgentOutput {
  content: string;
  slack_summary: string;
  confidence: number;
}

/**
 * Extract the outermost JSON object from text using brace counting
 * that ignores braces inside strings.
 */
function extractBalancedJson(text: string): string | null {
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * Repair common model-generated JSON issues:
 * - Literal newlines/carriage returns inside strings -> \n
 */
function repairJsonStringValues(json: string): string {
  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (escape) {
      result += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    if (inString && (char === "\n" || char === "\r")) {
      result += "\\n";
      continue;
    }
    result += char;
  }
  return result;
}

function tryParseJson(candidate: string): AgentOutput | null {
  try {
    const repaired = repairJsonStringValues(candidate);
    const parsed = JSON.parse(repaired) as Record<string, unknown>;
    const content = String(parsed.content ?? "").trim();
    if (!content) return null;
    return {
      content,
      slack_summary: String(parsed.slack_summary ?? "").trim() || content.slice(0, 300),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.75))),
    };
  } catch {
    return null;
  }
}

export function parseAgentOutput(raw: string): AgentOutput | null {
  // Strip markdown code fences the model sometimes wraps around JSON
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  // Strategy 1: balanced brace extraction (handles braces inside strings)
  const balanced = extractBalancedJson(stripped);
  if (balanced) {
    const result = tryParseJson(balanced);
    if (result) return result;
  }

  // Strategy 2: naive first { last } (legacy heuristic for post-amble text)
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const result = tryParseJson(stripped.slice(start, end + 1));
    if (result) return result;
  }

  // Strategy 3: look for the specific key pattern and extract from there
  const contentKeyMatch = stripped.match(/["']content["']\s*:\s*["']/);
  if (contentKeyMatch && contentKeyMatch.index != null) {
    const searchStart = Math.max(0, contentKeyMatch.index - 2);
    const candidate = stripped.slice(searchStart);
    const balancedFromKey = extractBalancedJson(candidate);
    if (balancedFromKey) {
      const result = tryParseJson(balancedFromKey);
      if (result) return result;
    }
  }

  return null;
}
