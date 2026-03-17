/**
 * Agent Loop with Tools — Phase 2
 *
 * Refactored to use a pluggable Tool Registry and Permission System.
 * Tools: read_file, list_directory, write_file, edit_file, run_command
 *
 * Run: npm run agent
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline";
import { DEFAULT_CONFIG, type MessageParam } from "./types.js";
import { ToolRegistry } from "../tools/registry.js";
import { readFileTool } from "../tools/read-file.js";
import { listDirectoryTool } from "../tools/list-directory.js";
import { writeFileTool } from "../tools/write-file.js";
import { editFileTool } from "../tools/edit-file.js";
import { runCommandTool } from "../tools/run-command.js";
import { PermissionManager } from "../permissions/manager.js";

const client = new Anthropic();
const messages: MessageParam[] = [];

const registry = new ToolRegistry();
registry.register(readFileTool);
registry.register(listDirectoryTool);
registry.register(writeFileTool);
registry.register(editFileTool);
registry.register(runCommandTool);

const permissionManager = new PermissionManager();

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  const tool = registry.get(name);
  if (!tool) {
    return `Error: Unknown tool: ${name}`;
  }

  const decision = await permissionManager.checkPermission(tool, input);
  if (decision === "deny") {
    return "Permission denied by user";
  }

  return tool.execute(input);
}

async function chat(userMessage: string): Promise<string> {
  messages.push({
    role: "user",
    content: userMessage,
  });

  while (true) {
    const response = await client.messages.create({
      model: DEFAULT_CONFIG.model,
      max_tokens: DEFAULT_CONFIG.maxTokens,
      system: DEFAULT_CONFIG.systemPrompt,
      tools: registry.toApiFormat(),
      messages,
    });

    console.log(
      `  [tokens: in=${response.usage.input_tokens}, out=${response.usage.output_tokens}, stop=${response.stop_reason}]`
    );

    if (response.stop_reason === "end_turn") {
      messages.push({ role: "assistant", content: response.content });

      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        console.log(`  [tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})]`);
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        toolResults.push({
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    return `[Unexpected stop_reason: ${response.stop_reason}]`;
  }
}

function startREPL(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const toolNames = registry.getAll().map((t) => t.name).join(", ");

  console.log("===========================================");
  console.log("  Angel Agent — Phase 2: Tools + Permissions");
  console.log(`  Tools: ${toolNames}`);
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
