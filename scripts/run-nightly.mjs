import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const mainWorkspace = resolveMainWorkspace(repoRoot);
const runtime = resolveRuntime(repoRoot, mainWorkspace);
const issues = buildPreflightIssues(runtime, process.env);

if (issues.length > 0) {
  console.error("Nightly scan preflight failed.");

  for (const issue of issues) {
    console.error(`- ${issue}`);
  }

  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnv = {
  ...process.env,
  ...(runtime.envFilePath ? { SCANNER_ENV_FILE: runtime.envFilePath } : {}),
};
const child = spawn(npmCommand, ["run", "scan"], {
  cwd: repoRoot,
  env: childEnv,
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

function resolveMainWorkspace(currentWorkspace) {
  const gitCommonDir = runGitCommand(currentWorkspace, ["rev-parse", "--git-common-dir"]);
  const resolvedGitCommonDir = resolve(currentWorkspace, gitCommonDir);
  const derivedWorkspace = dirname(resolvedGitCommonDir);

  if (!existsSync(derivedWorkspace)) {
    throw new Error(
      `Nightly scan could not find the main workspace derived from ${resolvedGitCommonDir}.`,
    );
  }

  return derivedWorkspace;
}

function resolveRuntime(currentWorkspace, sharedWorkspace) {
  const localEnvPath = join(currentWorkspace, ".env");
  const sharedEnvPath = join(sharedWorkspace, ".env");
  const localNodeModulesPath = join(currentWorkspace, "node_modules");
  const sharedNodeModulesPath = join(sharedWorkspace, "node_modules");

  const runtime = {
    currentWorkspace,
    sharedWorkspace,
    envFilePath: undefined,
    nodeModulesPath: undefined,
    dependencySource: "none",
  };

  if (existsSync(localEnvPath)) {
    runtime.envFilePath = localEnvPath;
  } else if (existsSync(sharedEnvPath)) {
    runtime.envFilePath = sharedEnvPath;
  }

  if (hasInstalledDependencies(localNodeModulesPath)) {
    runtime.nodeModulesPath = localNodeModulesPath;
    runtime.dependencySource = "local";
    return runtime;
  }

  if (existsSync(localNodeModulesPath)) {
    runtime.dependencySource = "broken_local";
    return runtime;
  }

  if (currentWorkspace !== sharedWorkspace && hasInstalledDependencies(sharedNodeModulesPath)) {
    ensureWorktreeNodeModulesLink(localNodeModulesPath, sharedNodeModulesPath);
    runtime.nodeModulesPath = localNodeModulesPath;
    runtime.dependencySource = "shared";
    return runtime;
  }

  runtime.dependencySource = "missing";
  return runtime;
}

function buildPreflightIssues(runtime, baseEnv) {
  const issues = [];

  if (runtime.dependencySource === "broken_local") {
    issues.push(
      `This worktree already has a node_modules folder at ${join(runtime.currentWorkspace, "node_modules")}, but it does not include the TypeScript build tools needed for the scan. Run \`npm ci\` here or remove that folder so the nightly script can reuse the main checkout dependencies.`,
    );
  } else if (runtime.dependencySource === "missing") {
    issues.push(
      `Could not find installed npm dependencies in this worktree or in the main checkout at ${runtime.sharedWorkspace}. Run \`npm ci\` in one of those locations before the nightly scan.`,
    );
  }

  if (!runtime.envFilePath && !hasInlineScannerConfig(baseEnv)) {
    issues.push(
      `Could not find a scanner .env file in this worktree or in the main checkout at ${runtime.sharedWorkspace}, and the required scanner environment variables are not set in this shell.`,
    );
  }

  return issues;
}

function hasInstalledDependencies(nodeModulesPath) {
  return existsSync(join(nodeModulesPath, ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"));
}

function ensureWorktreeNodeModulesLink(worktreeNodeModulesPath, sharedNodeModulesPath) {
  if (existsSync(worktreeNodeModulesPath)) {
    return;
  }

  const parent = dirname(worktreeNodeModulesPath);

  if (existsSync(parent) && lstatSync(parent).isDirectory()) {
    const symlinkType = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(sharedNodeModulesPath, worktreeNodeModulesPath, symlinkType);
  }
}

function hasInlineScannerConfig(baseEnv) {
  const requiredScannerKeys = [
    "NOTION_ROOT_PAGE_URL_OR_ID",
    "NOTION_CATALOG_DATABASE_URL_OR_ID",
    "NOTION_WORK_QUEUE_PAGE_URL_OR_ID",
    "NOTION_EXCLUDED_PAGE_URLS_OR_IDS",
  ];
  const hasRequiredScannerKeys = requiredScannerKeys.every((key) => Boolean(baseEnv[key]?.trim()));
  const hasNotionCredentials = Boolean(
    baseEnv.NOTION_TOKEN?.trim() || baseEnv.NOTION_ACCESS_TOKEN?.trim(),
  );

  return hasRequiredScannerKeys && hasNotionCredentials;
}

function runGitCommand(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(
      stderr
        ? `Nightly scan could not inspect the git worktree: ${stderr}`
        : "Nightly scan could not inspect the git worktree.",
    );
  }

  const stdout = (result.stdout || "").trim();

  if (!stdout) {
    throw new Error("Nightly scan could not determine the shared git directory.");
  }

  return stdout;
}
