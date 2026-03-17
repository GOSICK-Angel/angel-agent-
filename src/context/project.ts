import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProjectContext } from "./types.js";

const execFileAsync = promisify(execFile);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function runGitCommand(
  cwd: string,
  args: string[]
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function detectProject(
  rootPath: string
): Promise<ProjectContext> {
  const name = path.basename(rootPath);
  const claudeMdPath = path.join(rootPath, "CLAUDE.md");
  const packageJsonPath = path.join(rootPath, "package.json");
  const gitDir = path.join(rootPath, ".git");

  const hasGit = await fileExists(gitDir);

  const [claudeMd, packageJsonRaw, gitBranch, gitStatus] = await Promise.all([
    readFileIfExists(claudeMdPath),
    readFileIfExists(packageJsonPath),
    hasGit ? runGitCommand(rootPath, ["branch", "--show-current"]) : null,
    hasGit
      ? runGitCommand(rootPath, ["status", "--porcelain", "--short"])
      : null,
  ]);

  let packageJson: Record<string, unknown> | null = null;
  if (packageJsonRaw) {
    try {
      packageJson = JSON.parse(packageJsonRaw);
    } catch {
      packageJson = null;
    }
  }

  return {
    rootPath,
    name,
    claudeMd,
    packageJson,
    gitBranch,
    gitStatus,
    hasGit,
  };
}

export function formatProjectSummary(ctx: ProjectContext): string {
  const lines: string[] = [];

  lines.push(`Project: ${ctx.name}`);
  lines.push(`Path: ${ctx.rootPath}`);

  if (ctx.packageJson) {
    const pkg = ctx.packageJson;
    if (pkg.description) {
      lines.push(`Description: ${pkg.description}`);
    }
    if (pkg.dependencies) {
      const deps = Object.keys(pkg.dependencies as Record<string, string>);
      lines.push(`Dependencies: ${deps.join(", ")}`);
    }
  }

  if (ctx.hasGit) {
    lines.push(`Git branch: ${ctx.gitBranch ?? "unknown"}`);
    if (ctx.gitStatus) {
      const fileCount = ctx.gitStatus.split("\n").filter(Boolean).length;
      lines.push(`Git status: ${fileCount} changed file(s)`);
    } else {
      lines.push("Git status: clean");
    }
  }

  return lines.join("\n");
}
