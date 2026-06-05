import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";

// Precomputed "repo map" for an agent: the full file tree of a repository at a
// specific commit, rendered once and cached so sessions don't re-walk the tree
// over many GitHub API calls. Keyed by (repo, sha) — immutable per commit, so a
// cache hit is always valid; a new push produces a new SHA and a fresh row.
// This is Tier 1 of repo indexing (file-tree manifest); symbol maps come later.

export const repoIndexTable = pgTable(
  "repo_index",
  {
    id: serial("id").primaryKey(),
    repo: text("repo").notNull(), // "owner/name"
    sha: text("sha").notNull(), // commit SHA the tree was read at
    tree_map: text("tree_map").notNull(), // rendered, token-budgeted file tree
    file_count: integer("file_count").notNull(),
    // Version of the builder logic (filters/render) that produced this row. A row
    // built by an older version is treated as a miss and rebuilt — so changing the
    // ignore rules invalidates the cache without touching SHAs or manual cleanup.
    builder_version: integer("builder_version").notNull().default(1),
    // True when the tree was larger than the render budget and got clipped, or
    // when GitHub flagged the recursive tree response as truncated.
    truncated: boolean("truncated").notNull().default(false),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("repo_index_repo_sha_unique").on(t.repo, t.sha)],
);

export type RepoIndex = typeof repoIndexTable.$inferSelect;
