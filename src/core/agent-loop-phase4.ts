/**
 * Agent Loop Phase 4 — Advanced Agent Patterns
 *
 * Adds streaming output, loop prevention, multi-step reasoning,
 * colored terminal UI, spinners, and Ctrl+C handling.
 *
 * Run: npm run phase4
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
import { LoopGuard } from "../reasoning/loop-guard.js";
import {
  createPlan,
  completeStep,
  failStep,
  formatProgress,
  formatPlanSummary,
  parsePlanFromText,
} from "../reasoning/task-tracker.js";
import type { TaskPlan } from "../reasoning/types.js";
import { StreamRenderer } from "../ui/stream-renderer.js";
import { bold, dim, green, red, yellow, cyan } from "../ui/colors.js";
import { formatLoopWarning } from "../ui/tool-display.js";

const client = new Anthropic();
let messages: MessageParam[] = [];
let currentPlan: TaskPlan | null = null;
let currentStepIndex = 0;

const registry = new ToolRegistry();
registry.register(readFileTool);
registry.register(listDirectoryTool);
registry.register(writeFileTool);
registry.register(editFileTool);
registry.register(runCommandTool);

const permissionManager = new PermissionManager();
const contextManager = new ContextManager();
const loopGuard = new LoopGuard();
const renderer = new StreamRenderer();

let systemPrompt = DEFAULT_CONFIG.systemPrompt;
let abortController: AbortController | null = null;

async function initContext(): Promise<void> {
  const cwd = process.cwd();
  const projectContext = await detectProject(cwd);
  const tools = registry.getAll();
  systemPrompt = buildSystemPrompt(tools, projectContext);

  const promptTokens = estimateTokens(systemPrompt);
  console.log(dim(`  [context] Project: ${projectContext.name}`));
  console.log(dim(`  [context] Git: ${projectContext.gitBranch ?? "not a git repo"}`));
  console.log(dim(`  [context] System prompt: ~${promptTokens} tokens`));
}

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ result: string; isError: boolean }> {
  const tool = registry.get(name);
  if (!tool) {
    return { result: `Error: Unknown tool: ${name}`, isError: true };
  }

  const decision = await permissionManager.checkPermission(tool, input);
  if (decision === "deny") {
    return { result: "Permission denied by user", isError: true };
  }

  try {
    const result = await tool.execute(input);
    return { result: contextManager.truncateFileContent(result), isError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: `Error: ${message}`, isError: true };
  }
}

function extractAndTrackPlan(text: string): void {
  const parsed = parsePlanFromText(text);
  if (parsed && parsed.steps.length > 0) {
    currentPlan = createPlan(parsed.goal, parsed.steps);
    currentStepIndex = 0;
    console.log(dim(`\n  ${formatProgress(currentPlan)}`));
  }
}

function advancePlanStep(success: boolean, error?: string): void {
  if (!currentPlan || currentStepIndex >= currentPlan.steps.length) {
    return;
  }

  const stepId = currentPlan.steps[currentStepIndex].id;
  currentPlan = success
    ? completeStep(currentPlan, stepId)
    : failStep(currentPlan, stepId, error ?? "failed");

  if (success) {
    currentStepIndex++;
  }

  console.log(dim(`  ${formatProgress(currentPlan)}`));
}

async function chatStreaming(userMessage: string): Promise<string> {
  messages.push({ role: "user", content: userMessage });

  const systemTokens = estimateTokens(systemPrompt);

  if (contextManager.needsCompaction(messages, systemTokens)) {
    const result = contextManager.compact(messages, systemTokens);
    messages = result.messages;
    console.log(
      dim(`  [context] Compacted: saved ~${result.estimatedTokensSaved} tokens, dropped ${result.removedCount} messages`)
    );
  }

  let planContext = "";
  if (currentPlan) {
    planContext = `\n\nCurrent plan status:\n${formatPlanSummary(currentPlan)}`;
  }

  const fullSystem = systemPrompt + planContext;

  while (true) {
    abortController = new AbortController();

    let fullText = "";
    const toolUseBlocks: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
      inputJson: string;
    }> = [];
    let currentToolId = "";
    let currentToolName = "";
    let inputJsonBuffer = "";

    try {
      const stream = client.messages.stream(
        {
          model: DEFAULT_CONFIG.model,
          max_tokens: DEFAULT_CONFIG.maxTokens,
          system: fullSystem,
          tools: registry.toApiFormat(),
          messages,
        },
        { signal: abortController.signal }
      );

      renderer.startResponse();

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "text") {
            // text block starting
          } else if (block.type === "tool_use") {
            currentToolId = block.id;
            currentToolName = block.name;
            inputJsonBuffer = "";
            renderer.onToolUseStart(block.name, block.id);
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            renderer.onText(delta.text);
            fullText += delta.text;
          } else if (delta.type === "input_json_delta") {
            inputJsonBuffer += delta.partial_json;
            renderer.onToolUseInputDelta(delta.partial_json);
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolName && currentToolId) {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = inputJsonBuffer ? JSON.parse(inputJsonBuffer) : {};
            } catch {
              parsedInput = {};
            }
            toolUseBlocks.push({
              id: currentToolId,
              name: currentToolName,
              input: parsedInput,
              inputJson: inputJsonBuffer,
            });
            currentToolId = "";
            currentToolName = "";
            inputJsonBuffer = "";
          }
        }
      }

      const finalMessage = await stream.finalMessage();

      renderer.onUsage(
        finalMessage.usage.input_tokens,
        finalMessage.usage.output_tokens
      );

      if (finalMessage.stop_reason === "end_turn") {
        messages.push({ role: "assistant", content: finalMessage.content });
        renderer.endResponse();

        if (fullText) {
          extractAndTrackPlan(fullText);
        }

        return fullText;
      }

      if (finalMessage.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: finalMessage.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        let allSuccess = true;

        for (const toolUse of toolUseBlocks) {
          const guardResult = loopGuard.recordCall(toolUse.name, toolUse.input);

          if (guardResult.stop) {
            console.log(formatLoopWarning(guardResult.reason));
            renderer.flush();
            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: toolUse.id,
              content: `Loop guard stopped execution: ${guardResult.reason}`,
              is_error: true,
            });
            allSuccess = false;
            continue;
          }

          const { result, isError } = await executeTool(toolUse.name, toolUse.input);

          renderer.onToolUseComplete(toolUse.name, toolUse.input, result, isError);

          if (isError) {
            const errorGuard = loopGuard.recordError();
            allSuccess = false;
            if (errorGuard.reason) {
              console.log(formatLoopWarning(errorGuard.reason));
            }
          } else {
            loopGuard.recordSuccess();
          }

          toolResults.push({
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result,
            ...(isError ? { is_error: true } : {}),
          });
        }

        if (currentPlan && toolUseBlocks.length > 0) {
          advancePlanStep(allSuccess, allSuccess ? undefined : "tool error");
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      renderer.endResponse();
      return `[Unexpected stop_reason: ${finalMessage.stop_reason}]`;
    } catch (error) {
      renderer.flush();

      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"))
      ) {
        console.log(yellow("\n  [interrupted by user]"));
        messages.push({
          role: "assistant",
          content: [{ type: "text", text: fullText || "(interrupted)" }],
        });
        return "(interrupted)";
      }

      throw error;
    }
  }
}

function setupCtrlC(): void {
  let ctrlCCount = 0;
  let ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  process.on("SIGINT", () => {
    ctrlCCount++;

    if (ctrlCCount >= 2) {
      console.log(red("\n\nDouble Ctrl+C — exiting."));
      process.exit(0);
    }

    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    if (ctrlCTimer) {
      clearTimeout(ctrlCTimer);
    }
    ctrlCTimer = setTimeout(() => {
      ctrlCCount = 0;
    }, 1000);
  });
}

function startREPL(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const toolNames = registry.getAll().map((t) => t.name).join(", ");

  console.log(bold("==========================================="));
  console.log(bold("  Angel Agent — Phase 4: Advanced Patterns"));
  console.log(dim(`  Tools: ${toolNames}`));
  console.log(dim("  Streaming: enabled | Loop guard: enabled"));
  console.log(dim("  Ctrl+C: interrupt | Double Ctrl+C: exit"));
  console.log(bold("===========================================\n"));

  function prompt(): void {
    rl.question(green("You> "), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit") {
        console.log(dim("Goodbye!"));
        rl.close();
        process.exit(0);
      }

      if (trimmed.toLowerCase() === "/plan") {
        if (currentPlan) {
          console.log(cyan(formatPlanSummary(currentPlan)));
        } else {
          console.log(dim("No active plan."));
        }
        console.log("");
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "/stats") {
        const stats = loopGuard.getStats();
        console.log(dim(`  Total calls: ${stats.totalCalls}`));
        console.log(dim(`  Unique calls: ${stats.uniqueCalls}`));
        console.log(dim(`  Consecutive errors: ${stats.consecutiveErrors}`));
        console.log("");
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "/reset") {
        messages = [];
        currentPlan = null;
        currentStepIndex = 0;
        loopGuard.reset();
        console.log(dim("  Session reset."));
        console.log("");
        prompt();
        return;
      }

      try {
        await chatStreaming(trimmed);
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          console.error(red(`\nAPI Error: ${error.status} — ${error.message}\n`));
        } else {
          console.error(red("\nError:"), error, "\n");
        }
      }

      prompt();
    });
  }

  prompt();
}

async function main(): Promise<void> {
  setupCtrlC();
  await initContext();
  console.log("");
  startREPL();
}

main();
