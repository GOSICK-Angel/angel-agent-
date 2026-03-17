import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";

const inputSchema = z.object({
  path: z.string(),
});

export const listDirectoryTool: Tool = {
  name: "list_directory",
  description:
    "List files and directories at the given path. " +
    "Returns a list of entries with their types (file or directory). " +
    "Use this to explore project structure.",
  inputSchema,
  apiSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "The directory path to list (relative to working directory)",
      },
    },
    required: ["path"],
  },
  riskLevel: "read",

  async execute(rawInput: unknown): Promise<string> {
    const input = inputSchema.parse(rawInput);
    const dirPath = input.path;

    try {
      const resolved = path.resolve(dirPath);
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const formatted = entries
        .map((entry) => {
          const type = entry.isDirectory() ? "[dir] " : "[file]";
          return `  ${type} ${entry.name}`;
        })
        .join("\n");
      return `Contents of ${dirPath}:\n${formatted}`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return `Error: Directory not found: ${dirPath}`;
      }
      return `Error listing directory: ${err.message}`;
    }
  },
};
