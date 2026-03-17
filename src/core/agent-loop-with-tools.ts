/**
 * Agent Loop with Tools — Phase 1.2
 *
 * Adds tool use capability to the basic agent loop.
 * Claude can now read files and list directories — it can "see" your project.
 *
 * Run: npm run agent
 *
 * Key difference from Phase 1.1:
 * - The loop now checks stop_reason
 * - If stop_reason === "tool_use", execute tools and continue the loop
 * - If stop_reason === "end_turn", show text to user and wait for input
 *
 * Architecture:
 *
 *   User Input
 *       ↓
 *   ┌── Send to Claude API (with tools) ◄──┐
 *   │       ↓                               │
 *   │   stop_reason?                        │
 *   │       │                               │
 *   │   "tool_use" ──► Execute tools ───────┘
 *   │       │           └── append tool_result
 *   │   "end_turn"
 *   │       ↓
 *   └── Show text to user
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_CONFIG, type MessageParam, type ContentBlock } from "./types.js";

// SDK auto-reads env vars: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY
const client = new Anthropic();
const messages: MessageParam[] = [];

// ============================================================
// 1. TOOL DEFINITIONS
//    These tell Claude what tools are available.
//    Claude reads the name + description + schema to decide
//    when and how to call each tool.
// ============================================================

const tools: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file at the given path. " +
      "Returns the file content as a string. " +
      "Use this to examine source code, config files, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "The file path to read (relative to working directory)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_directory",
    description:
      "List files and directories at the given path. " +
      "Returns a list of entries with their types (file or directory). " +
      "Use this to explore project structure.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "The directory path to list (relative to working directory)",
        },
      },
      required: ["path"],
    },
  },
];

// ============================================================
// 2. TOOL EXECUTION
//    Each tool is a simple function that takes validated input
//    and returns a string result.
//    Errors are caught and returned as strings — never crash.
// ============================================================

function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "read_file": {
      const filePath = input.path as string;
      try {
        const resolved = path.resolve(filePath);
        const content = fs.readFileSync(resolved, "utf-8");

        // Truncate very large files (context window protection)
        const MAX_CHARS = 10000;
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
    }

    case "list_directory": {
      const dirPath = input.path as string;
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
    }

    default:
      return `Error: Unknown tool: ${name}`;
  }
}

// ============================================================
// 3. THE AGENT LOOP (with tools)
//    This is the heart of the agent. It loops until Claude
//    responds with stop_reason === "end_turn".
// ============================================================

async function chat(userMessage: string): Promise<string> {
  messages.push({
    role: "user",
    content: userMessage,
  });

  // The tool loop: keep calling the API until Claude is done
  while (true) {
    const response = await client.messages.create({
      model: DEFAULT_CONFIG.model,
      max_tokens: DEFAULT_CONFIG.maxTokens,
      system: DEFAULT_CONFIG.systemPrompt,
      tools,
      messages,
    });

    console.log(
      `  [tokens: in=${response.usage.input_tokens}, out=${response.usage.output_tokens}, stop=${response.stop_reason}]`
    );

    // ---- Case 1: Claude is done (end_turn) ----
    if (response.stop_reason === "end_turn") {
      // Save assistant message to history
      messages.push({ role: "assistant", content: response.content });

      // Extract and return text
      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }

    // ---- Case 2: Claude wants to use tools ----
    if (response.stop_reason === "tool_use") {
      // Save assistant message (with tool_use blocks) to history
      messages.push({ role: "assistant", content: response.content });

      // Find all tool_use blocks in the response
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      // Execute each tool and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(
        (toolUse) => {
          console.log(`  [tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})]`);
          const result = executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result,
          };
        }
      );

      // Append tool results as a "user" message
      // (this is how the protocol works — tool results go in user messages)
      messages.push({
        role: "user",
        content: toolResults,
      });

      // Continue the loop — Claude will process the tool results
      continue;
    }

    // ---- Case 3: Unexpected stop reason ----
    return `[Unexpected stop_reason: ${response.stop_reason}]`;
  }
}

// ============================================================
// 4. REPL with tool support
// ============================================================

function startREPL(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("===========================================");
  console.log("  Angel Agent — Phase 1.2: With Tools");
  console.log("  Tools: read_file, list_directory");
  console.log("  Type 'exit' to quit");
  console.log("===========================================\n");

  function prompt(): void {
    rl.question("You> ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit") {
        console.log("Goodbye!");
        rl.close();
        process.exit(0);
      }

      try {
        const response = await chat(trimmed);
        console.log(`\nAssistant> ${response}\n`);
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          console.error(`\nAPI Error: ${error.status} — ${error.message}\n`);
        } else {
          console.error("\nError:", error, "\n");
        }
      }

      prompt();
    });
  }

  prompt();
}

startREPL();
