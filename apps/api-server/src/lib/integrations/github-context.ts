import { Octokit } from "octokit";
import { logger } from "../logger";

export function getRepoFromPayload(
  payload: Record<string, unknown>,
  repoId?: string,
): { owner: string; repo: string } | null {
  const repo = payload.repository as { full_name?: string } | undefined;
  const fullName = repo?.full_name || repoId;
  if (!fullName) return null;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  return { owner, repo: name };
}

// Ordered by priority — first match wins per "slot" (agent instructions, cursor, windsurf, github)
export const INSTRUCTION_FILE_CANDIDATES = [
  // Agent instruction files (Claude, OpenAI, generic)
  "CLAUDE.md",
  ".claude/CLAUDE.md",
  "AGENTS.md",
  ".github/AGENTS.md",
  "agents.md",
  // Cursor
  ".cursorrules",
  ".cursor/rules",
  // Windsurf
  ".windsurfrules",
  ".windsurf/rules",
  // GitHub Copilot / generic
  ".github/copilot-instructions.md",
  ".github/instructions/instructions.md",
  ".github/instructions/coding.md",
];

export async function fetchRepoInstructions(
  client: Octokit,
  owner: string,
  repoName: string,
): Promise<string> {
  const found: string[] = [];

  await Promise.all(
    INSTRUCTION_FILE_CANDIDATES.map(async (path) => {
      try {
        const { data } = await client.rest.repos.getContent({ owner, repo: repoName, path });
        if (!Array.isArray(data) && "content" in data && typeof data.content === "string") {
          const decoded = Buffer.from(data.content, "base64").toString("utf-8");
          if (decoded.trim()) {
            found.push(`### ${path}\n${decoded.slice(0, 4_000)}`);
          }
        }
      } catch {
        // file doesn't exist — skip
      }
    }),
  );

  if (found.length === 0) return "";
  return `Repository AI instructions (treat these as authoritative context for this codebase):\n\n${found.join("\n\n---\n\n")}`;
}

export async function detectTechStack(
  client: Octokit,
  owner: string,
  repoName: string,
): Promise<string> {
  const checks = [
    { path: "package.json", label: "JavaScript/Node.js" },
    { path: "Cargo.toml", label: "Rust" },
    { path: "pyproject.toml", label: "Python" },
    { path: "requirements.txt", label: "Python" },
    { path: "go.mod", label: "Go" },
    { path: "composer.json", label: "PHP" },
    { path: "Gemfile", label: "Ruby" },
    { path: "pom.xml", label: "Java" },
    { path: "build.gradle", label: "Java" },
    { path: "pubspec.yaml", label: "Dart/Flutter" },
  ];

  for (const c of checks) {
    try {
      const { data } = await client.rest.repos.getContent({ owner, repo: repoName, path: c.path });
      if (!Array.isArray(data) && data.type === "file") {
        if (c.path === "package.json") {
          try {
            const content = Buffer.from(data.content, "base64").toString("utf-8");
            const pkg = JSON.parse(content) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
            const deps = Object.keys(pkg.dependencies || {});
            const devDeps = Object.keys(pkg.devDependencies || {});
            const all = [...deps, ...devDeps];
            const fw: string[] = [];
            if (all.includes("react")) fw.push("React");
            if (all.includes("next")) fw.push("Next.js");
            if (all.includes("vue")) fw.push("Vue");
            if (all.includes("svelte")) fw.push("Svelte");
            if (all.includes("express")) fw.push("Express");
            if (all.includes("fastify")) fw.push("Fastify");
            if (devDeps.includes("typescript") || deps.includes("typescript")) fw.push("TypeScript");
            return `JavaScript/Node.js${fw.length ? ` — ${fw.join(", ")}` : ""}`;
          } catch {
            return "JavaScript/Node.js";
          }
        }
        return c.label;
      }
    } catch {
      // file not found
    }
  }
  return "";
}

export async function gatherEventContext(
  eventType: string,
  payload: Record<string, unknown>,
  githubToken: string | undefined,
  repoId?: string,
): Promise<string> {
  if (!githubToken) return "";

  const repo = payload.repository as { full_name?: string } | undefined;
  const repoFullName = repo?.full_name || repoId;
  if (!repoFullName) return "";
  const [owner, repoName] = repoFullName.split("/");
  if (!owner || !repoName) return "";

  const client = new Octokit({ auth: githubToken });
  const parts: string[] = [];

  try {
    if (eventType === "pr_opened" || eventType === "pr_merged" || eventType === "pr_closed") {
      const prNumber = (payload.pull_request as { number?: number } | undefined)?.number;
      if (prNumber) {
        try {
          const { data: pr } = await client.rest.pulls.get({ owner, repo: repoName, pull_number: prNumber });
          const { data: files } = await client.rest.pulls.listFiles({ owner, repo: repoName, pull_number: prNumber });
          parts.push(`PR #${pr.number}: ${pr.title}`);
          parts.push(`State: ${pr.state} | Additions: ${pr.additions} | Deletions: ${pr.deletions} | Changed files: ${pr.changed_files}`);
          if (pr.body) parts.push(`Description:\n${pr.body.slice(0, 2_000)}`);
          if (files.length > 0) {
            parts.push("Changed files:");
            for (const f of files.slice(0, 20)) {
              parts.push(`  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`);
              if (f.patch) parts.push(`    Patch:\n${f.patch.slice(0, 5_000)}`);
            }
          }
        } catch (err) {
          parts.push(`Could not fetch PR #${prNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (eventType === "issue_opened" || eventType === "issue_updated") {
      const issueNumber = (payload.issue as { number?: number } | undefined)?.number;
      if (issueNumber) {
        try {
          const { data: issue } = await client.rest.issues.get({ owner, repo: repoName, issue_number: issueNumber });
          const { data: comments } = await client.rest.issues.listComments({ owner, repo: repoName, issue_number: issueNumber });
          parts.push(`Issue #${issue.number}: ${issue.title}`);
          parts.push(`State: ${issue.state} | Labels: ${issue.labels.map((l) => (typeof l === "string" ? l : l.name)).join(", ")}`);
          if (issue.body) parts.push(`Body:\n${issue.body.slice(0, 2_000)}`);
          if (comments.length > 0) {
            parts.push("Comments:");
            for (const c of comments.slice(0, 5)) {
              parts.push(`  ${c.user?.login}: ${c.body?.slice(0, 500)}`);
            }
          }
        } catch (err) {
          parts.push(`Could not fetch issue #${issueNumber}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (eventType === "push") {
      const sha = (payload.head_commit as { id?: string } | undefined)?.id;
      if (sha) {
        try {
          const { data: commit } = await client.rest.repos.getCommit({ owner, repo: repoName, ref: sha });
          parts.push(`Commit: ${commit.commit.message}`);
          parts.push(`Author: ${commit.commit.author?.name} | Date: ${commit.commit.author?.date}`);
          if (commit.files && commit.files.length > 0) {
            parts.push("Files changed:");
            for (const f of commit.files.slice(0, 20)) {
              parts.push(`  ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`);
              if (f.patch) parts.push(`    Patch:\n${f.patch.slice(0, 5_000)}`);
            }
          }
        } catch (err) {
          parts.push(`Could not fetch commit ${sha}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (eventType === "ticket_created") {
      try {
        const { data: readme } = await client.rest.repos.getContent({ owner, repo: repoName, path: "README.md" });
        if (!Array.isArray(readme) && "content" in readme && typeof readme.content === "string") {
          const decoded = Buffer.from(readme.content, "base64").toString("utf8");
          parts.push(`README.md:\n${decoded.slice(0, 3_000)}`);
        }
      } catch {
        // no readme
      }

      // Read package manifest to give the agent dependency context
      for (const manifest of ["package.json", "go.mod", "pyproject.toml", "Cargo.toml"]) {
        try {
          const { data } = await client.rest.repos.getContent({ owner, repo: repoName, path: manifest });
          if (!Array.isArray(data) && "content" in data && typeof data.content === "string") {
            const decoded = Buffer.from(data.content, "base64").toString("utf8");
            parts.push(`${manifest}:\n${decoded.slice(0, 2_000)}`);
            break; // one manifest is enough
          }
        } catch {
          // not present
        }
      }
    }

    // List repo root + expand key source dirs one level deep so the agent has a map without burning tool calls
    if (eventType === "ticket_created" || eventType === "issue_opened") {
      try {
        const { data: root } = await client.rest.repos.getContent({ owner, repo: repoName, path: "" });
        if (Array.isArray(root)) {
          parts.push("Repository root:");
          parts.push(root.map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n"));

          const expandDirs = root
            .filter((e) => e.type === "dir" && ["src", "lib", "app", "apps", "packages", "services", "api", "server", "backend", "frontend"].includes(e.name))
            .slice(0, 4);

          await Promise.all(
            expandDirs.map(async (dir) => {
              try {
                const { data: children } = await client.rest.repos.getContent({ owner, repo: repoName, path: dir.path });
                if (Array.isArray(children)) {
                  parts.push(`📁 ${dir.name}/`);
                  parts.push(children.map((e) => `  ${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n"));
                }
              } catch {
                // ignore
              }
            }),
          );
        }
      } catch {
        // ignore
      }
    }
  } catch (err) {
    logger.warn({ err }, "Context gathering failed");
  }

  return parts.join("\n\n");
}
