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

## Phase 3: Plan — required sections

**Objective summary** — what the ticket asks for and why, in your own words (not just a restatement)

**Affected files** — each file path with a 1-line description of what changes and why

**Step-by-step tasks** — ordered list; each task must include:
  - File path(s) to change
  - What specifically to add, modify, or remove
  - Why (the reasoning, not a restatement of what)

**New dependencies** — new files, packages, DB schema changes, feature flags required

**Dependencies / blockers** — other tickets, upstream changes, or infrastructure requirements that must land first

**Edge cases** — logic spread across multiple files, error handling concerns, backwards compatibility, race conditions

**Complexity estimate** — Low / Medium / High with a 1-sentence justification

**Confidence** — roughly what percentage of the relevant code did you actually read before writing this plan?`,
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

## Phase 3: Plan — required sections

**Objective summary** — what is being asked for and why

**Affected files** — each file path with a 1-line description of changes

**Step-by-step tasks** — ordered; each with file path, what changes, and why

**New dependencies** — packages, schema changes, new files required

**Edge cases** — error handling, backwards compatibility, concurrency concerns

**Complexity estimate** — Low / Medium / High with a 1-sentence justification

**Confidence** — what percentage of the relevant code did you read?`,
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
  await db.insert(playbooksTable)
    .values(SYSTEM_PLAYBOOKS.map((p) => ({ ...p, source: "system" as const })))
    .onConflictDoNothing({ target: playbooksTable.slug });
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
