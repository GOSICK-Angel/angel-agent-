import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { Tool } from "./types.js";

const inputSchema = z.object({
  path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
});

const CONTEXT_LINES = 3;

function getContext(content: string, index: number, newStr: string): string {
  const lines = content.split("\n");
  const before = content.slice(0, index);
  const startLine = before.split("\n").length - 1;

  const replaced = content.slice(0, index) + newStr + content.slice(index + newStr.length);
  const replacedLines = replaced.split("\n");

  const newStrLines = newStr.split("\n").length;
  const endLine = startLine + newStrLines - 1;

  const contextStart = Math.max(0, startLine - CONTEXT_LINES);
  const contextEnd = Math.min(replacedLines.length - 1, endLine + CONTEXT_LINES);

  const contextLines = replacedLines.slice(contextStart, contextEnd + 1);
  return contextLines
    .map((line, i) => {
      const lineNum = contextStart + i + 1;
      return `${String(lineNum).padStart(4)} | ${line}`;
    })
    .join("\n");
}

export const editFileTool: Tool = {
  name: "edit_file",
  description:
    "Make an exact string replacement in a file. " +
    "Replaces the first occurrence of old_string with new_string. " +
    "The old_string must match exactly and appear exactly once in the file.",
  inputSchema,
  apiSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "The file path to edit (relative to working directory)",
      },
      old_string: {
        type: "string",
        description: "The exact string to find and replace",
      },
      new_string: {
        type: "string",
        description: "The string to replace old_string with",
      },
    },
    required: ["path", "old_string", "new_string"],
  },
  riskLevel: "write",

  async execute(rawInput: unknown): Promise<string> {
    const input = inputSchema.parse(rawInput);
    const filePath = input.path;

    try {
      const resolved = path.resolve(filePath);
      const content = fs.readFileSync(resolved, "utf-8");

      const firstIndex = content.indexOf(input.old_string);
      if (firstIndex === -1) {
        return `Error: old_string not found in ${filePath}`;
      }

      const secondIndex = content.indexOf(input.old_string, firstIndex + 1);
      if (secondIndex !== -1) {
        return `Error: old_string appears multiple times in ${filePath}. Provide a more unique string.`;
      }

      const newContent =
        content.slice(0, firstIndex) +
        input.new_string +
        content.slice(firstIndex + input.old_string.length);

      fs.writeFileSync(resolved, newContent, "utf-8");

      const context = getContext(newContent, firstIndex, input.new_string);
      return `Edited ${filePath}:\n${context}`;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return `Error: File not found: ${filePath}`;
      }
      return `Error editing file: ${err.message}`;
    }
  },
};
