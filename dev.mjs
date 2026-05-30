import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const envPath = new URL(".env.local", import.meta.url);

// Load .env.local if it exists, without overriding existing env vars.
// On Replit, Secrets provide env vars directly so this is a no-op.
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const child = spawn(
  "pnpm",
  ["--filter", "@workspace/api-server", "--filter", "@workspace/ops-bridge", "run", "dev"],
  { stdio: "inherit", shell: true, cwd: root }
);

child.on("exit", (code) => process.exit(code ?? 0));
