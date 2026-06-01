export interface AgentOutput {
  content: string;
  slack_summary: string;
  confidence: number;
}

export function parseAgentOutput(raw: string): AgentOutput {
  // Strip markdown code fences the model sometimes wraps around JSON
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
      const content = String(parsed.content ?? "").trim();
      if (content) {
        return {
          content,
          slack_summary: String(parsed.slack_summary ?? "").trim() || content.slice(0, 300),
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.75))),
        };
      }
    } catch {
      // fall through to legacy
    }
  }

  // Legacy fallback: plain-text response with optional CONFIDENCE: trailer
  const confidenceMatch = raw.match(/CONFIDENCE:\s*([\d.]+)\s*$/im);
  const confidence = confidenceMatch ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]))) : 0.75;
  const content = raw.replace(/\n?CONFIDENCE:\s*[\d.]+\s*$/im, "").trim();
  return { content, slack_summary: content.slice(0, 300), confidence };
}
