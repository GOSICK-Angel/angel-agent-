import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";

const inputSchema = z.object({
  path: z.string(),
});

const MAX_CHARS = 10000;

export const readFileTool: Tool = {
  name: "read_file",
  description:
    "Read the contents of a file at the given path. " +
    "Returns the file content as a string. " +
    "Use this to examine source code, config files, etc.",
  inputSchema,
  apiSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "The file path to read (relative to working directory)",
      },
    },
    required: ["path"],
  },
  riskLevel: "read",

  async execute(rawInput: unknown): Promise<string> {
    const input = inputSchema.parse(rawInput);
    const filePath = input.path;

    try {
      const resolved = path.resolve(filePath);
      const content = fs.readFileSync(resolved, "utf-8");

      if (content.length > MAX_CHARS) {
        return (
          content.slice(0, MAX_CHARS) +
          `\n\n... [truncated, ${content.length - MAX_CHARS} more characters]`
        );
      }
      return content;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return `Error: File not found: ${filePath}`;
      }
      if (err.code === "EISDIR") {
        return `Error: ${filePath} is a directory, not a file. Use list_directory instead.`;
      }
      return `Error reading file: ${err.message}`;
    }
  },
};
