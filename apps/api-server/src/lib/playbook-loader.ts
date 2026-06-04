import { db } from "@workspace/db";
import { playbooksTable, skillsTable } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import type { Playbook, Skill } from "@workspace/db";

// ── System playbook definitions ───────────────────────────────────────────────

const SYSTEM_PLAYBOOKS: Array<{
  slug: string;
  name: string;
  objective: "diagnose" | "plan";
  trigger_source: "linear" | "github" | "sentry" | null;
  instructions: string;
}> = [
  {
    slug: "linear-plan",
    name: "Linear: Plan",
    objective: "plan",
    trigger_source: "linear",
    instructions: `## Objective
Produce a source-code-grounded implementation plan for a Linear ticket.

## Phase 1: Context Gathering
Fetch full ticket details including all comments and attachments — comments often contain critical clarifications not in the main description.

Think about the full user intent. Tickets are often sparse — consider the broader scope the author intended, not just the literal text.

Identify 2-4 key technical terms from the title/description (function names, service names, module names — not generic words like "add" or "update"). Search the codebase for each term to locate relevant files, then read those files directly.

Read at least 2-3 source files before writing the plan. Plans based only on file names are not acceptable.

## Phase 2: Research
- Identify all files that need modification and map their dependencies
- Trace data flow and control flow through affected functions
- Check git history for the affected files if context is unclear
- Note any related configuration files, tests, or migrations

## Phase 3: Plan

Be terse — structured sections over prose, no restatement of the ticket, no filler. Cite file paths and function/class/symbol names, never line numbers (they drift and are usually wrong). Omit any section that does not change the decision.

Scope discipline: recommend the smallest change that fully satisfies the ticket. Justify every extra file, DB column, config option, or model call with a concrete reason it is needed NOW — not "might be useful later." If part of the work is deferred to a follow-up, add ZERO plumbing for it: no column, no API field, no codegen for a feature you are not building yet.

Required sections:

**Objective summary** — what the ticket asks for and why, in your own words. If the premise is flawed, over-scoped, or rests on a false assumption, say so here and recommend the simpler path.

**Affected files** — each file path with a 1-line description of what changes and why.

**Step-by-step tasks** — ordered; each tagged \`required\` or \`optional\`, with file path(s), what to add/modify/remove, and the reasoning (not a restatement of what).

**Risks** — at most the 3 most material: regressions, breaking changes to existing callers, race/ordering concerns. One line each.

**Grounding** — what percentage of the relevant code did you actually read? This measures evidence gathered, not whether the design is right.

**Design confidence** — separately, how confident are you the approach is correct (0–1)? Lower it if the premise is uncertain or you propose changing code you did not read.`,
  },
  {
    slug: "generic-plan",
    name: "Generic: Plan",
    objective: "plan",
    trigger_source: null,
    instructions: `## Objective
Produce a source-code-grounded implementation plan for a feature request or engineering ticket.

## Phase 1: Context Gathering
Read the full request carefully — consider the broader intent, not just the literal text.

Identify 2-4 key technical terms and search the codebase for each. Read 2-3 directly relevant source files before writing anything.

## Phase 2: Research
- Map all files that need modification and their dependencies
- Trace data flow through affected functions
- Note any schema, config, or dependency changes required

## Phase 3: Plan

Be terse — structured sections over prose, no restatement of the request, no filler. Cite file paths and function/symbol names, never line numbers (they drift and are usually wrong). Omit any section that does not change the decision.

Scope discipline: recommend the smallest change that fully satisfies the request. Justify every extra file, schema column, config option, or model call with a concrete reason it is needed NOW — not "might be useful later." If part of the work is deferred, add ZERO plumbing for it.

Required sections:

**Objective summary** — what is being asked for and why, in your own words. If the premise is flawed or over-scoped, say so and recommend the simpler path.

**Affected files** — each file path with a 1-line description of changes.

**Step-by-step tasks** — ordered; each tagged \`required\` or \`optional\`, with file path, what changes, and why.

**Risks** — at most the 3 most material: regressions, breaking changes, concurrency/ordering. One line each.

**Grounding** — what percentage of the relevant code did you actually read? (evidence, not design correctness)

**Design confidence** — separately, how confident are you the approach is correct (0–1)?`,
  },
  {
    slug: "incident-diagnose",
    name: "Incident: Diagnose",
    objective: "diagnose",
    trigger_source: null,
    instructions: `## Objective
Produce a concise, source-code-grounded diagnosis of an engineering incident, error, or anomaly.

## Phase 1: Investigation
Identify the error type and where it originates. Search the codebase for the relevant function, module, or file involved.

Check recent commits (last 5-10) for changes to the affected area that may have introduced the regression.

Read the actual implementation — do not diagnose from file names or error messages alone.

## Phase 2: Diagnosis — required sections (keep total under 300 words)

**Root cause** — what is actually failing and why, citing real file:function references where possible

**Severity** — P0 (full outage), P1 (major degraded), P2 (partial impaired), P3 (cosmetic) — with a 1-sentence justification

**Immediate action** — the single most important thing to do right now

**Estimated resolution** — time range with reasoning

**Prevention** — what structural change would prevent this class of issue

Do not speculate beyond what the code and error evidence support.`,
  },
];

// ── Seed ─────────────────────────────────────────────────────────────────────

export async function seedSystemPlaybooks(): Promise<void> {
  // Upsert: system playbooks are defined in code and are authoritative, so edits
  // here propagate on the next boot. We update the content fields but preserve
  // is_active so an operator who deactivated a system playbook keeps that choice.
  for (const p of SYSTEM_PLAYBOOKS) {
    await db.insert(playbooksTable)
      .values({ ...p, source: "system" as const })
      .onConflictDoUpdate({
        target: playbooksTable.slug,
        set: {
          name: p.name,
          objective: p.objective,
          trigger_source: p.trigger_source,
          instructions: p.instructions,
        },
      });
  }
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loadPlaybook(
  objective: string,
  eventSource: string,
): Promise<Playbook | null> {
  const rows = await db
    .select()
    .from(playbooksTable)
    .where(
      and(
        eq(playbooksTable.objective, objective as "diagnose" | "plan"),
        eq(playbooksTable.is_active, true),
        or(
          eq(playbooksTable.trigger_source, eventSource as "linear" | "github" | "sentry"),
          isNull(playbooksTable.trigger_source),
        ),
      ),
    );

  if (rows.length === 0) return null;

  // Prefer: user > system, specific source > wildcard
  rows.sort((a, b) => {
    if (a.source !== b.source) return a.source === "user" ? -1 : 1;
    const aSpecific = a.trigger_source === eventSource;
    const bSpecific = b.trigger_source === eventSource;
    if (aSpecific !== bSpecific) return aSpecific ? -1 : 1;
    return 0;
  });

  return rows[0] ?? null;
}

export async function loadActiveSkills(): Promise<Skill[]> {
  return db.select()
    .from(skillsTable)
    .where(eq(skillsTable.is_active, true))
    .orderBy(skillsTable.created_at)
    .limit(50);
}
