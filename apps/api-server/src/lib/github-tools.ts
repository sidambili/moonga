import { Octokit } from "octokit";
import { logger } from "./logger";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

let octokit: Octokit | null = null;

function getOctokit(token: string): Octokit {
  if (!octokit) {
    octokit = new Octokit({ auth: token });
  }
  return octokit;
}

function clearOctokit() {
  octokit = null;
}

function getRepoFromEvent(eventPayload: Record<string, unknown>): { owner: string; repo: string } | null {
  const repo = eventPayload.repository as Record<string, unknown> | undefined;
  if (!repo) return null;
  const fullName = repo.full_name as string | undefined;
  if (!fullName) return null;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  return { owner, repo: name };
}

export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_file_contents",
      description: "Fetch the contents of a file from a GitHub repository. Returns the raw text content or base64 for binary files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path within the repo, e.g. 'src/index.ts'" },
          ref: { type: "string", description: "Git ref (branch, tag, or commit SHA). Defaults to default branch." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories at a path in a GitHub repository. Useful for exploring repo structure.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path within the repo. Use empty string for root." },
          ref: { type: "string", description: "Git ref (branch, tag, or commit SHA). Defaults to default branch." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_commit_diff",
      description: "Get the diff (patch) for a specific commit. Useful for analyzing what changed.",
      parameters: {
        type: "object",
        properties: {
          sha: { type: "string", description: "Commit SHA" },
        },
        required: ["sha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pull_request",
      description: "Get details about a pull request including title, body, changed files, and diff.",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "Pull request number" },
        },
        required: ["number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_issue",
      description: "Get details about a GitHub issue including title, body, labels, and comments.",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "Issue number" },
        },
        required: ["number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description: "Search for code across a GitHub repository using GitHub code search.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "GitHub code search query. Example: 'filename:package.json' or 'class User'" },
        },
        required: ["query"],
      },
    },
  },
];

async function executeTool(
  toolCall: ToolCall,
  githubToken: string,
  eventPayload: Record<string, unknown>,
): Promise<ToolResult> {
  const repo = getRepoFromEvent(eventPayload);
  if (!repo) {
    return {
      tool_call_id: toolCall.id,
      role: "tool",
      content: "Error: No repository information available in the event payload.",
    };
  }

  const client = getOctokit(githubToken);
  const { owner, repo: repoName } = repo;
  let result: string;

  try {
    const args = JSON.parse(toolCall.function.arguments);

    switch (toolCall.function.name) {
      case "get_file_contents": {
        const { data } = await client.rest.repos.getContent({
          owner,
          repo: repoName,
          path: args.path,
          ref: args.ref,
        });
        if (Array.isArray(data)) {
          result = `Error: ${args.path} is a directory, not a file. Use list_directory instead.`;
        } else if (data.type === "file") {
          const content = data.content ? Buffer.from(data.content, "base64").toString("utf-8") : "";
          // Truncate very large files
          result = content.length > 100_000
            ? content.slice(0, 100_000) + "\n\n[... truncated: file exceeds 100KB limit]"
            : content;
        } else {
          result = `Error: ${args.path} is not a file.`;
        }
        break;
      }

      case "list_directory": {
        const { data } = await client.rest.repos.getContent({
          owner,
          repo: repoName,
          path: args.path || "",
          ref: args.ref,
        });
        if (!Array.isArray(data)) {
          result = `Error: ${args.path} is not a directory.`;
        } else {
          const entries = data.map((item) => ({
            name: item.name,
            type: item.type,
            path: item.path,
            size: item.size,
          }));
          result = JSON.stringify(entries, null, 2);
        }
        break;
      }

      case "get_commit_diff": {
        const { data } = await client.rest.repos.getCommit({
          owner,
          repo: repoName,
          ref: args.sha,
        });
        const files = data.files?.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch || "",
        })) ?? [];
        result = JSON.stringify(files, null, 2);
        break;
      }

      case "get_pull_request": {
        const { data: pr } = await client.rest.pulls.get({
          owner,
          repo: repoName,
          pull_number: args.number,
        });
        const { data: files } = await client.rest.pulls.listFiles({
          owner,
          repo: repoName,
          pull_number: args.number,
        });
        const prData = {
          title: pr.title,
          body: pr.body,
          state: pr.state,
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changed_files,
          files: files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch || "",
          })),
        };
        result = JSON.stringify(prData, null, 2);
        break;
      }

      case "get_issue": {
        const { data: issue } = await client.rest.issues.get({
          owner,
          repo: repoName,
          issue_number: args.number,
        });
        const { data: comments } = await client.rest.issues.listComments({
          owner,
          repo: repoName,
          issue_number: args.number,
        });
        const issueData = {
          title: issue.title,
          body: issue.body,
          state: issue.state,
          labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
          comments: comments.map((c) => ({ body: c.body, user: c.user?.login, created_at: c.created_at })),
        };
        result = JSON.stringify(issueData, null, 2);
        break;
      }

      case "search_code": {
        const query = `${args.query} repo:${owner}/${repoName}`;
        const { data } = await client.rest.search.code({ q: query });
        const searchData = {
          total_count: data.total_count,
          items: data.items.map((item) => ({
            path: item.path,
            url: item.html_url,
            score: item.score,
          })),
        };
        result = JSON.stringify(searchData, null, 2);
        break;
      }

      default:
        result = `Error: Unknown tool "${toolCall.function.name}".`;
    }
  } catch (err) {
    logger.warn({ err, tool: toolCall.function.name, repo: `${owner}/${repoName}` }, "GitHub tool execution failed");
    result = `Error executing ${toolCall.function.name}: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Limit result size to avoid token explosion
  if (result.length > 50_000) {
    result = result.slice(0, 50_000) + "\n\n[... truncated: result exceeds 50KB limit]";
  }

  return {
    tool_call_id: toolCall.id,
    role: "tool",
    content: result,
  };
}

export async function executeToolCalls(
  toolCalls: ToolCall[],
  githubToken: string | null | undefined,
  eventPayload: Record<string, unknown>,
): Promise<ToolResult[]> {
  if (!githubToken) {
    return toolCalls.map((tc) => ({
      tool_call_id: tc.id,
      role: "tool",
      content: "Error: GitHub integration is not configured. No API token available.",
    }));
  }

  clearOctokit();
  const results = await Promise.all(
    toolCalls.map((tc) => executeTool(tc, githubToken, eventPayload)),
  );
  return results;
}
