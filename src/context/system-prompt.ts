import type { Tool } from "../tools/types.js";
import type { ProjectContext, SystemPromptConfig } from "./types.js";
import { DEFAULT_PROMPT_CONFIG } from "./types.js";
import { formatProjectSummary } from "./project.js";

function buildAgentIdentity(): string {
  return [
    "You are Angel Agent, an AI coding assistant that helps with software engineering tasks.",
    "You can read, write, and edit files, run shell commands, and search codebases.",
    "You are thorough, careful, and always explain your reasoning before taking actions.",
  ].join("\n");
}

function buildToolInstructions(tools: Tool[]): string {
  if (tools.length === 0) {
    return "";
  }

  const lines: string[] = ["## Available Tools", ""];

  for (const tool of tools) {
    lines.push(`- **${tool.name}** (${tool.riskLevel}): ${tool.description}`);
  }

  lines.push("");
  lines.push("## Tool Usage Guidelines");
  lines.push("- Use read-only tools freely to understand the codebase before making changes.");
  lines.push("- When editing files, use the smallest possible change to achieve the goal.");
  lines.push("- Always verify your changes by reading the file after editing.");
  lines.push("- For shell commands, prefer non-destructive operations.");

  return lines.join("\n");
}

function buildCodeStyleRules(): string {
  return [
    "## Code Style Rules",
    "- Follow the existing code style in the project.",
    "- Use TypeScript with strict mode when the project uses TypeScript.",
    "- Prefer immutable patterns: create new objects instead of mutating.",
    "- Keep functions small (under 50 lines) and files focused.",
    "- Add proper error handling with try-catch for risky operations.",
    "- Validate inputs at system boundaries.",
  ].join("\n");
}

function buildSafetyRules(): string {
  return [
    "## Safety Rules",
    "- NEVER commit or expose secrets (API keys, passwords, tokens).",
    "- NEVER run destructive commands (rm -rf /, drop database, etc.) without explicit user confirmation.",
    "- NEVER modify files outside the project directory without permission.",
    "- Always validate file paths to prevent path traversal attacks.",
    "- When in doubt about a risky operation, ask the user first.",
  ].join("\n");
}

function buildProjectContextSection(ctx: ProjectContext): string {
  const lines: string[] = ["## Project Context", ""];
  lines.push(formatProjectSummary(ctx));

  if (ctx.claudeMd) {
    const truncated =
      ctx.claudeMd.length > 2000
        ? ctx.claudeMd.slice(0, 2000) + "\n...(truncated)"
        : ctx.claudeMd;
    lines.push("");
    lines.push("## Project Instructions (CLAUDE.md)");
    lines.push(truncated);
  }

  return lines.join("\n");
}

export function buildSystemPrompt(
  tools: Tool[],
  projectContext: ProjectContext | null,
  config: SystemPromptConfig = DEFAULT_PROMPT_CONFIG
): string {
  const sections: string[] = [];

  if (config.agentIdentity) {
    sections.push(buildAgentIdentity());
  }

  if (config.toolInstructions) {
    const toolSection = buildToolInstructions(tools);
    if (toolSection) {
      sections.push(toolSection);
    }
  }

  if (config.codeStyleRules) {
    sections.push(buildCodeStyleRules());
  }

  if (config.safetyRules) {
    sections.push(buildSafetyRules());
  }

  if (config.projectContext && projectContext) {
    sections.push(buildProjectContextSection(projectContext));
  }

  return sections.join("\n\n");
}
