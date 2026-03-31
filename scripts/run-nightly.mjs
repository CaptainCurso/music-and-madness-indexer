import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const envPath = resolve(repoRoot, ".env");
const tscPath = resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

const hasNotionCredentials = Boolean(
  process.env.NOTION_TOKEN?.trim() || process.env.NOTION_ACCESS_TOKEN?.trim(),
);

const issues = [];

if (!existsSync(tscPath)) {
  issues.push(`Dependencies are not installed in this worktree. Run \`npm ci\` in ${repoRoot}.`);
}

if (!existsSync(envPath) && !hasNotionCredentials) {
  issues.push(
    `No .env file was found at ${envPath}, and no NOTION_TOKEN or NOTION_ACCESS_TOKEN is set in this shell.`,
  );
}

if (issues.length > 0) {
  console.error("Nightly scan preflight failed.");

  for (const issue of issues) {
    console.error(`- ${issue}`);
  }

  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "scan"], {
  cwd: repoRoot,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to start npm: ${error.message}`);
  process.exit(1);
});
