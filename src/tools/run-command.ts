import { execSync } from "node:child_process";
import { z } from "zod";
import type { Tool } from "./types.js";

const inputSchema = z.object({
  command: z.string(),
  timeout: z.number().min(1).max(120).optional(),
});

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  /mkfs\b/,
  /format\s+[a-zA-Z]:/,
  /dd\s+.*of=\/dev\//,
  />\s*\/dev\/sd[a-z]/,
  /chmod\s+-R\s+777\s+\//,
  /chown\s+-R\s+.*\s+\//,
];

const MAX_OUTPUT = 10000;
const DEFAULT_TIMEOUT_S = 30;

export const runCommandTool: Tool = {
  name: "run_command",
  description:
    "Execute a shell command and return its output. " +
    "Use this for running build tools, tests, git commands, etc. " +
    "Commands run in the project root directory.",
  inputSchema,
  apiSchema: {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: 30, max: 120)",
      },
    },
    required: ["command"],
  },
  riskLevel: "dangerous",

  async execute(rawInput: unknown): Promise<string> {
    const input = inputSchema.parse(rawInput);
    const { command } = input;
    const timeoutS = input.timeout ?? DEFAULT_TIMEOUT_S;

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return `Error: Command rejected — matches dangerous pattern: ${pattern}`;
      }
    }

    try {
      const output = execSync(command, {
        cwd: process.cwd(),
        timeout: timeoutS * 1000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 1024 * 1024,
      });

      const result = output.trim();
      if (result.length > MAX_OUTPUT) {
        return (
          result.slice(0, MAX_OUTPUT) +
          `\n\n... [truncated, ${result.length - MAX_OUTPUT} more characters]`
        );
      }
      return result || "(no output)";
    } catch (error) {
      const err = error as { status?: number; stdout?: string; stderr?: string; message?: string };

      if (err.stdout || err.stderr) {
        const stdout = (err.stdout ?? "").trim();
        const stderr = (err.stderr ?? "").trim();
        const parts: string[] = [`Exit code: ${err.status ?? "unknown"}`];
        if (stdout) parts.push(`stdout:\n${stdout}`);
        if (stderr) parts.push(`stderr:\n${stderr}`);
        const combined = parts.join("\n\n");

        if (combined.length > MAX_OUTPUT) {
          return combined.slice(0, MAX_OUTPUT) + "\n\n... [truncated]";
        }
        return combined;
      }

      return `Error executing command: ${err.message ?? String(error)}`;
    }
  },
};
