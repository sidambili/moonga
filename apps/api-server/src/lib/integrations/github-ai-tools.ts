import { Octokit } from "octokit";
import { tool } from "ai";
import { z } from "zod";

export function createGithubTools(
  ghClient: Octokit | null,
  repo: { owner: string; repo: string } | null,
  checkToolLimit: () => string | null,
) {
  const noGithub = "Error: GitHub integration not configured";

  return {
    get_file_contents: tool({
      description: "Fetch the contents of a file from the GitHub repository. Also use this for package manifests (package.json, Cargo.toml, go.mod, etc.).",
      parameters: z.object({
        path: z.string().describe("File path within the repo, e.g. 'src/index.ts'"),
        ref: z.string().optional().describe("Git ref (branch, tag, or commit SHA)"),
      }),
      execute: async ({ path, ref }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.getContent({ owner: repo.owner, repo: repo.repo, path, ref });
          if (Array.isArray(data)) return "Error: path is a directory, not a file";
          if (data.type === "file") {
            const content = data.content ? Buffer.from(data.content, "base64").toString("utf-8") : "";
            return content.length > 100_000 ? content.slice(0, 100_000) + "\n\n[...truncated]" : content;
          }
          return "Error: not a file";
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    get_commit_diff: tool({
      description: "Get the diff (patch) for a specific commit SHA. Useful for analyzing what changed.",
      parameters: z.object({
        sha: z.string().describe("Commit SHA"),
      }),
      execute: async ({ sha }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.getCommit({ owner: repo.owner, repo: repo.repo, ref: sha });
          const files = data.files?.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch || "",
          })) ?? [];
          return JSON.stringify(files, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    get_pull_request: tool({
      description: "Get details about a pull request including title, body, changed files, and diff.",
      parameters: z.object({
        number: z.number().describe("Pull request number"),
      }),
      execute: async ({ number }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const [{ data: pr }, { data: files }] = await Promise.all([
            ghClient.rest.pulls.get({ owner: repo.owner, repo: repo.repo, pull_number: number }),
            ghClient.rest.pulls.listFiles({ owner: repo.owner, repo: repo.repo, pull_number: number }),
          ]);
          return JSON.stringify({
            title: pr.title,
            body: pr.body,
            state: pr.state,
            additions: pr.additions,
            deletions: pr.deletions,
            changed_files: pr.changed_files,
            files: files.map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch || "" })),
          }, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    get_issue: tool({
      description: "Get details about a GitHub issue including title, body, labels, and comments.",
      parameters: z.object({
        number: z.number().describe("Issue number"),
      }),
      execute: async ({ number }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const [{ data: issue }, { data: comments }] = await Promise.all([
            ghClient.rest.issues.get({ owner: repo.owner, repo: repo.repo, issue_number: number }),
            ghClient.rest.issues.listComments({ owner: repo.owner, repo: repo.repo, issue_number: number }),
          ]);
          return JSON.stringify({
            title: issue.title,
            body: issue.body,
            state: issue.state,
            labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
            comments: comments.map((c) => ({ body: c.body, user: c.user?.login, created_at: c.created_at })),
          }, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    get_recent_commits: tool({
      description: "Get the most recent commits on the default branch. Useful for spotting regressions.",
      parameters: z.object({
        per_page: z.number().optional().describe("Number of commits to fetch (max 30)"),
      }),
      execute: async ({ per_page }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.listCommits({
            owner: repo.owner,
            repo: repo.repo,
            per_page: Math.min(per_page || 10, 30),
          });
          return JSON.stringify(data.map((c) => ({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author?.name,
            date: c.commit.author?.date,
          })), null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    list_directory: tool({
      description: "List files and directories at a path in the GitHub repository",
      parameters: z.object({
        path: z.string().describe("Directory path. Use empty string for root."),
        ref: z.string().optional(),
      }),
      execute: async ({ path, ref }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const { data } = await ghClient.rest.repos.getContent({ owner: repo.owner, repo: repo.repo, path: path || "", ref });
          if (!Array.isArray(data)) return "Error: not a directory";
          return JSON.stringify(data.map((e) => ({ name: e.name, type: e.type, path: e.path, size: e.size })), null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),

    search_code: tool({
      description: "Search for code across the GitHub repository",
      parameters: z.object({
        query: z.string().describe("Search query, e.g. 'filename:package.json' or 'class User'"),
      }),
      execute: async ({ query }) => {
        const limit = checkToolLimit(); if (limit) return limit;
        if (!ghClient || !repo) return noGithub;
        try {
          const q = `${query} repo:${repo.owner}/${repo.repo}`;
          const { data } = await ghClient.rest.search.code({ q });
          return JSON.stringify({
            total_count: data.total_count,
            items: data.items.map((item) => ({ path: item.path, url: item.html_url, score: item.score })),
          }, null, 2);
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    }),
  };
}
