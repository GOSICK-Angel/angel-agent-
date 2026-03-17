/**
 * Agent Loop with Context Management — Phase 3
 *
 * Adds dynamic system prompt and context window management
 * on top of the Phase 2 tool + permission system.
 *
 * Run: npm run context-agent
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
import { detectProject } from "../context/project.js";
import { buildSystemPrompt } from "../context/system-prompt.js";
import {
  ContextManager,
  estimateTokens,
  estimateMessagesTokens,
} from "../context/manager.js";

const client = new Anthropic();
let messages: MessageParam[] = [];

const registry = new ToolRegistry();
registry.register(readFileTool);
registry.register(listDirectoryTool);
registry.register(writeFileTool);
registry.register(editFileTool);
registry.register(runCommandTool);

const permissionManager = new PermissionManager();
const contextManager = new ContextManager();

let systemPrompt = DEFAULT_CONFIG.systemPrompt;

async function initContext(): Promise<void> {
  const cwd = process.cwd();
  const projectContext = await detectProject(cwd);
  const tools = registry.getAll();
  systemPrompt = buildSystemPrompt(tools, projectContext);

  const promptTokens = estimateTokens(systemPrompt);
  console.log(`  [context] Project: ${projectContext.name}`);
  console.log(`  [context] Git: ${projectContext.gitBranch ?? "not a git repo"}`);
  console.log(`  [context] System prompt: ~${promptTokens} tokens`);
}

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

  const result = await tool.execute(input);
  return contextManager.truncateFileContent(result);
}

async function chat(userMessage: string): Promise<string> {
  messages.push({
    role: "user",
    content: userMessage,
  });

  const systemTokens = estimateTokens(systemPrompt);

  if (contextManager.needsCompaction(messages, systemTokens)) {
    const result = contextManager.compact(messages, systemTokens);
    messages = result.messages;
    console.log(
      `  [context] Compacted: saved ~${result.estimatedTokensSaved} tokens, dropped ${result.removedCount} messages`
    );
  }

  while (true) {
    const response = await client.messages.create({
      model: DEFAULT_CONFIG.model,
      max_tokens: DEFAULT_CONFIG.maxTokens,
      system: systemPrompt,
      tools: registry.toApiFormat(),
      messages,
    });

    const msgTokens = estimateMessagesTokens(messages);
    console.log(
      `  [tokens: in=${response.usage.input_tokens}, out=${response.usage.output_tokens}, context=~${msgTokens}, stop=${response.stop_reason}]`
    );

    if (response.stop_reason === "end_turn") {
      messages.push({ role: "assistant", content: response.content });

      return response.content
        .filter(
          (block): block is Anthropic.TextBlock => block.type === "text"
        )
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
        console.log(
          `  [tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})]`
        );
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
  console.log("  Angel Agent — Phase 3: Context & Intelligence");
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

async function main(): Promise<void> {
  await initContext();
  console.log("");
  startREPL();
}

main();
