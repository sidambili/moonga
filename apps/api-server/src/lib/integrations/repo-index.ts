import { Octokit } from "octokit";
import { db, repoIndexTable, type RepoIndex } from "@workspace/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { logger } from "../logger";

// Bump whenever the builder's output changes (ignore rules, render format, budgets)
// so previously-cached rows are treated as stale and rebuilt on next access.
const BUILDER_VERSION = 2;

// Per repo, keep only this many most-recent SHAs; older rows are pruned after a
// build so the cache doesn't grow unbounded as a repo accumulates commits.
const KEEP_SHAS_PER_REPO = 5;

// Tier 1 repo indexing: render the full file tree of a repo at a commit ONCE via
// the git Trees API (a single recursive call), then cache it keyed by (repo, sha).
// Handing this map to the agent upfront stops it burning tool calls walking the
// tree with list_directory/get_file_contents just to orient itself.

const MAX_FILES = 800; // cap path count before rendering
const MAX_CHARS = 14_000; // hard budget on the rendered tree

// Any path containing one of these directory segments is dropped. Three buckets:
// build output / vendored deps / VCS internals; codegen output (`generated` — the
// agent should read the source-of-truth spec, not derived files); and agent/editor
// tooling (skills, memories, rules) that's meta to the codebase, not part of it.
const IGNORE_SEGMENTS = new Set([
  // build output, vendored deps, VCS internals
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
  ".svelte-kit",
  "coverage",
  "vendor",
  "__pycache__",
  ".venv",
  ".pytest_cache",
  "target",
  // codegen output — derived, never hand-edited
  "generated",
  // agent / editor tooling — meta, not application code
  ".agents",
  ".claude",
  ".cursor",
  ".windsurf",
  ".vscode",
  ".idea",
]);
const IGNORE_FILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "Cargo.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
]);

// Binary / asset extensions — never source the agent reasons about.
const IGNORE_EXTENSIONS = new Set([
  // images
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "avif", "bmp", "tiff",
  // fonts
  "woff", "woff2", "ttf", "eot", "otf",
  // media
  "mp4", "webm", "mov", "avi", "mp3", "wav", "ogg", "flac",
  // archives / binaries / sourcemaps
  "zip", "gz", "tar", "rar", "7z", "pdf", "wasm", "exe", "dll", "so", "dylib", "map",
]);

function shouldIgnore(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((s) => IGNORE_SEGMENTS.has(s))) return true;

  const name = segments[segments.length - 1];
  if (IGNORE_FILES.has(name)) return true;
  if (name.endsWith(".min.js") || name.endsWith(".min.css")) return true;

  const dot = name.lastIndexOf(".");
  if (dot > 0 && IGNORE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())) return true;
  return false;
}

// Resolve a concrete commit SHA. Prefer a caller-supplied one (from the event
// payload); otherwise fall back to the default branch head.
async function resolveSha(client: Octokit, owner: string, repo: string, sha?: string): Promise<string> {
  if (sha) return sha;
  const { data: meta } = await client.rest.repos.get({ owner, repo });
  const { data: branch } = await client.rest.repos.getBranch({ owner, repo, branch: meta.default_branch });
  return branch.commit.sha;
}

type TreeNode = { dirs: Map<string, TreeNode>; files: string[] };

function renderTree(paths: string[]): string {
  const root: TreeNode = { dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      let next = node.dirs.get(seg);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        node.dirs.set(seg, next);
      }
      node = next;
    }
    node.files.push(parts[parts.length - 1]);
  }

  const lines: string[] = [];
  const walk = (node: TreeNode, depth: number) => {
    const indent = "  ".repeat(depth);
    for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`${indent}${name}/`);
      walk(child, depth + 1);
    }
    for (const f of node.files.sort()) {
      lines.push(`${indent}${f}`);
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

type BuiltMap = Pick<RepoIndex, "repo" | "sha" | "tree_map" | "file_count" | "truncated">;

async function buildRepoMap(client: Octokit, owner: string, repoName: string, sha: string): Promise<BuiltMap> {
  const { data } = await client.rest.git.getTree({ owner, repo: repoName, tree_sha: sha, recursive: "1" });

  const allBlobs = data.tree.filter((e): e is typeof e & { path: string } => e.type === "blob" && typeof e.path === "string" && !shouldIgnore(e.path));
  const fileCount = allBlobs.length;

  // Budget: cap path count, then cap rendered chars. Either trip flags truncation.
  let truncated = data.truncated === true || fileCount > MAX_FILES;
  const paths = allBlobs
    .map((e) => e.path)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_FILES);

  let map = renderTree(paths);
  if (map.length > MAX_CHARS) {
    map = map.slice(0, MAX_CHARS);
    const lastNl = map.lastIndexOf("\n");
    if (lastNl > 0) map = map.slice(0, lastNl);
    truncated = true;
  }

  return { repo: `${owner}/${repoName}`, sha, tree_map: map, file_count: fileCount, truncated };
}

// Get the cached repo map for the repo at the resolved SHA, building + caching it
// on a miss. Returns null if the repo can't be reached (caller treats as "no map").
export async function getOrBuildRepoMap(
  client: Octokit,
  owner: string,
  repoName: string,
  sha?: string,
): Promise<BuiltMap | null> {
  const repoFull = `${owner}/${repoName}`;
  try {
    const resolved = await resolveSha(client, owner, repoName, sha);

    const [cached] = await db
      .select()
      .from(repoIndexTable)
      .where(and(eq(repoIndexTable.repo, repoFull), eq(repoIndexTable.sha, resolved)))
      .limit(1);
    // A hit is only valid if it was built by the current builder version; an older
    // row falls through to a rebuild that overwrites it (see upsert below).
    if (cached && cached.builder_version === BUILDER_VERSION) return cached;

    const built = await buildRepoMap(client, owner, repoName, resolved);
    const row = { ...built, builder_version: BUILDER_VERSION };
    // Upsert: a concurrent same-SHA build or a stale older-version row both resolve
    // to the freshly-built value rather than racing or going ignored.
    await db
      .insert(repoIndexTable)
      .values(row)
      .onConflictDoUpdate({
        target: [repoIndexTable.repo, repoIndexTable.sha],
        set: { tree_map: row.tree_map, file_count: row.file_count, truncated: row.truncated, builder_version: BUILDER_VERSION },
      });
    await pruneOldShas(repoFull);
    return row;
  } catch (err) {
    logger.warn({ err, repo: repoFull }, "Repo map build failed");
    return null;
  }
}

// Keep only the most-recent KEEP_SHAS_PER_REPO rows for a repo; drop the rest.
async function pruneOldShas(repoFull: string): Promise<void> {
  const keep = await db
    .select({ id: repoIndexTable.id })
    .from(repoIndexTable)
    .where(eq(repoIndexTable.repo, repoFull))
    .orderBy(desc(repoIndexTable.created_at))
    .limit(KEEP_SHAS_PER_REPO);
  if (keep.length < KEEP_SHAS_PER_REPO) return; // nothing older to prune
  const cutoff = keep[keep.length - 1].id;
  await db
    .delete(repoIndexTable)
    .where(and(eq(repoIndexTable.repo, repoFull), lt(repoIndexTable.id, cutoff)));
}

// Force a rebuild of a repo's map(s) by dropping its cached rows. Pass a specific
// SHA to invalidate just that commit, or omit to clear every SHA for the repo. The
// next session rebuilds lazily. Returns the number of rows removed.
export async function reindexRepo(repoFull: string, sha?: string): Promise<number> {
  const where = sha
    ? and(eq(repoIndexTable.repo, repoFull), eq(repoIndexTable.sha, sha))
    : eq(repoIndexTable.repo, repoFull);
  const deleted = await db.delete(repoIndexTable).where(where).returning({ id: repoIndexTable.id });
  return deleted.length;
}

// Render the map for injection into agent context.
export function formatRepoMap(map: BuiltMap): string {
  const header = `Repository file tree (${map.file_count} files at ${map.sha.slice(0, 7)}${map.truncated ? ", truncated" : ""}). Use this to locate files instead of listing directories:`;
  return `${header}\n\n${map.tree_map}`;
}
