import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";

const inputSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Write content to a file at the given path. " +
    "Creates the file if it doesn't exist. " +
    "Overwrites the file if it already exists. " +
    "Automatically creates parent directories as needed.",
  inputSchema,
  apiSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "The file path to write to (relative to working directory)",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["path", "content"],
  },
  riskLevel: "write",

  async execute(rawInput: unknown): Promise<string> {
    const input = inputSchema.parse(rawInput);
    const filePath = input.path;

    try {
      const resolved = path.resolve(filePath);
      const existed = fs.existsSync(resolved);

      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, input.content, "utf-8");

      const bytes = Buffer.byteLength(input.content, "utf-8");
      const status = existed ? "Overwrote existing file" : "Created new file";
      return `${status}: ${filePath} (${bytes} bytes written)`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return `Error writing file: ${err.message}`;
    }
  },
};
