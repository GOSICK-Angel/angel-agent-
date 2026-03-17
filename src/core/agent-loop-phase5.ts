/**
 * Agent Loop Phase 5 — Production Patterns
 *
 * Adds sub-agent delegation, parallel tool execution,
 * session persistence, project memory, and config reading.
 *
 * Run: npm run phase5
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
import { AgentCoordinator } from "../agents/coordinator.js";
import { executeToolsInParallel } from "../agents/parallel.js";
import type { ToolUseRequest } from "../agents/parallel.js";
import {
  saveSession,
  loadSession,
  listSessions,
  createSessionData,
} from "../memory/session.js";
import {
  loadMemory,
  saveFact,
  persistMemory,
  formatMemoryForPrompt,
} from "../memory/project-memory.js";
import { readAgentConfig } from "../memory/config-reader.js";
import type { ProjectMemoryData } from "../memory/types.js";

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
const coordinator = new AgentCoordinator();

let systemPrompt = DEFAULT_CONFIG.systemPrompt;
let abortController: AbortController | null = null;
let projectPath = process.cwd();
let memoryData: ProjectMemoryData | null = null;

const delegateTaskTool: Anthropic.Tool = {
  name: "delegate_task",
  description:
    "Delegate a subtask to a sub-agent. The sub-agent runs in isolation with its own context. Use for independent subtasks that don't need the full conversation history.",
  input_schema: {
    type: "object" as const,
    properties: {
      task: {
        type: "string",
        description: "The task description for the sub-agent",
      },
      name: {
        type: "string",
        description: "A short name for this sub-agent",
      },
      allowed_tools: {
        type: "array",
        items: { type: "string" },
        description:
          "Tools the sub-agent can use. Defaults to all available tools.",
      },
    },
    required: ["task", "name"],
  },
};

async function initContext(): Promise<void> {
  const cwd = process.cwd();
  projectPath = cwd;
  const projectContext = await detectProject(cwd);
  const tools = registry.getAll();
  systemPrompt = buildSystemPrompt(tools, projectContext);

  memoryData = await loadMemory(cwd);
  const memorySection = formatMemoryForPrompt(memoryData);
  if (memorySection) {
    systemPrompt += "\n\n" + memorySection;
  }

  const config = await readAgentConfig(cwd);
  if (config["System Prompt"]) {
    systemPrompt += "\n\n## Custom Instructions\n" + config["System Prompt"];
  }

  const promptTokens = estimateTokens(systemPrompt);
  console.log(dim(`  [context] Project: ${projectContext.name}`));
  console.log(
    dim(`  [context] Git: ${projectContext.gitBranch ?? "not a git repo"}`)
  );
  console.log(dim(`  [context] System prompt: ~${promptTokens} tokens`));
  console.log(
    dim(`  [context] Memory: ${memoryData.facts.length} facts loaded`)
  );
}

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ result: string; isError: boolean }> {
  if (name === "delegate_task") {
    return executeDelegateTask(input);
  }

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
    return {
      result: contextManager.truncateFileContent(result),
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: `Error: ${message}`, isError: true };
  }
}

async function executeDelegateTask(
  input: Record<string, unknown>
): Promise<{ result: string; isError: boolean }> {
  const task = input.task as string;
  const name = input.name as string;
  const allowedTools = input.allowed_tools as string[] | undefined;

  console.log(dim(`  [sub-agent] Spawning "${name}"...`));

  const spawnResult = coordinator.spawn({
    name,
    task,
    allowedTools,
    maxTurns: 10,
  });

  if (!spawnResult.success) {
    return {
      result: `Failed to spawn sub-agent: ${spawnResult.error}`,
      isError: true,
    };
  }

  try {
    const completedAgent = await coordinator.runAgent(
      spawnResult.agentId,
      client,
      registry,
      permissionManager,
      systemPrompt
    );

    console.log(
      dim(
        `  [sub-agent] "${name}" ${completedAgent.status} (${completedAgent.toolCallCount} tool calls)`
      )
    );

    if (completedAgent.status === "completed" && completedAgent.result) {
      return { result: completedAgent.result, isError: false };
    }

    return {
      result: completedAgent.error ?? "Sub-agent failed without error message",
      isError: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: `Sub-agent error: ${message}`, isError: true };
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
      dim(
        `  [context] Compacted: saved ~${result.estimatedTokensSaved} tokens, dropped ${result.removedCount} messages`
      )
    );
  }

  let planContext = "";
  if (currentPlan) {
    planContext = `\n\nCurrent plan status:\n${formatPlanSummary(currentPlan)}`;
  }

  const fullSystem = systemPrompt + planContext;

  const apiTools: Anthropic.Tool[] = [
    ...registry.toApiFormat(),
    delegateTaskTool,
  ];

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
          tools: apiTools,
          messages,
        },
        { signal: abortController.signal }
      );

      renderer.startResponse();

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
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
              parsedInput = inputJsonBuffer
                ? JSON.parse(inputJsonBuffer)
                : {};
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

        const hasReadOnly = toolUseBlocks.some((t) => {
          const tool = registry.get(t.name);
          return tool && tool.riskLevel === "read";
        });
        const allReadOnly = toolUseBlocks.every((t) => {
          const tool = registry.get(t.name);
          return tool && tool.riskLevel === "read";
        });

        let toolResults: Anthropic.ToolResultBlockParam[];

        if (hasReadOnly && allReadOnly && toolUseBlocks.length > 1) {
          const requests: ToolUseRequest[] = toolUseBlocks.map((t) => ({
            id: t.id,
            name: t.name,
            input: t.input,
          }));
          const parallelResults = await executeToolsInParallel(
            requests,
            registry,
            permissionManager
          );
          toolResults = parallelResults.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.toolUseId,
            content: contextManager.truncateFileContent(r.result),
            ...(r.isError ? { is_error: true } : {}),
          }));

          for (const r of parallelResults) {
            if (r.isError) {
              loopGuard.recordError();
            } else {
              loopGuard.recordSuccess();
            }
            renderer.onToolUseComplete(r.name, {}, r.result, r.isError);
          }
        } else {
          toolResults = [];
          let allSuccess = true;

          for (const toolUse of toolUseBlocks) {
            const guardResult = loopGuard.recordCall(
              toolUse.name,
              toolUse.input
            );

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

            const { result, isError } = await executeTool(
              toolUse.name,
              toolUse.input
            );

            renderer.onToolUseComplete(
              toolUse.name,
              toolUse.input,
              result,
              isError
            );

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

async function handleSave(): Promise<void> {
  const session = createSessionData(projectPath, messages, {
    model: DEFAULT_CONFIG.model,
    totalTokensUsed: 0,
    toolCallCount: loopGuard.getStats().totalCalls,
  });
  await saveSession(projectPath, session);
  console.log(dim(`  Session saved: ${session.id}`));
}

async function handleResume(): Promise<void> {
  const sessions = await listSessions(projectPath);
  if (sessions.length === 0) {
    console.log(dim("  No saved sessions found."));
    return;
  }

  console.log(dim("  Available sessions:"));
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const date = new Date(s.updatedAt).toLocaleString();
    const msgCount = s.messages.length;
    console.log(dim(`  ${i + 1}. ${s.id.slice(0, 8)}... (${msgCount} messages, ${date})`));
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(dim("  Enter session number: "), resolve);
  });
  rl.close();

  const index = parseInt(answer, 10) - 1;
  if (index < 0 || index >= sessions.length) {
    console.log(dim("  Invalid selection."));
    return;
  }

  const selected = sessions[index];
  const loaded = await loadSession(projectPath, selected.id);
  if (!loaded) {
    console.log(dim("  Failed to load session."));
    return;
  }

  messages = [...loaded.messages] as MessageParam[];
  console.log(dim(`  Resumed session ${loaded.id.slice(0, 8)}... (${messages.length} messages)`));
}

async function handleMemory(args: string): Promise<void> {
  if (!memoryData) {
    memoryData = await loadMemory(projectPath);
  }

  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0] || "list";

  if (subcommand === "list") {
    if (memoryData.facts.length === 0) {
      console.log(dim("  No facts stored."));
      return;
    }
    for (const fact of memoryData.facts) {
      console.log(dim(`  ${fact.key}: ${fact.value} (${fact.source})`));
    }
    return;
  }

  if (subcommand === "set") {
    const key = parts[1];
    const value = parts.slice(2).join(" ");
    if (!key || !value) {
      console.log(dim("  Usage: /memory set <key> <value>"));
      return;
    }
    memoryData = saveFact(memoryData, key, value, "user");
    await persistMemory(memoryData);
    console.log(dim(`  Saved: ${key} = ${value}`));
    return;
  }

  if (subcommand === "delete") {
    const key = parts[1];
    if (!key) {
      console.log(dim("  Usage: /memory delete <key>"));
      return;
    }
    const { removeFact } = await import("../memory/project-memory.js");
    memoryData = removeFact(memoryData, key);
    await persistMemory(memoryData);
    console.log(dim(`  Deleted: ${key}`));
    return;
  }

  console.log(dim("  Commands: /memory list | /memory set <key> <value> | /memory delete <key>"));
}

function handleAgents(): void {
  const agents = coordinator.getAllAgents();
  if (agents.length === 0) {
    console.log(dim("  No sub-agents spawned in this session."));
    return;
  }

  for (const agent of agents) {
    const status = agent.status === "completed"
      ? green(agent.status)
      : agent.status === "failed"
        ? red(agent.status)
        : dim(agent.status);
    console.log(
      dim(`  ${agent.config.name} (${agent.id.slice(0, 8)}...): `) + status +
        dim(` — ${agent.toolCallCount} tool calls`)
    );
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

  const toolNames = registry
    .getAll()
    .map((t) => t.name)
    .join(", ");

  console.log(bold("================================================"));
  console.log(bold("  Angel Agent — Phase 5: Production Patterns"));
  console.log(dim(`  Tools: ${toolNames}, delegate_task`));
  console.log(dim("  Features: sub-agents | parallel exec | memory | sessions"));
  console.log(dim("  Ctrl+C: interrupt | Double Ctrl+C: exit"));
  console.log(bold("================================================\n"));

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

      if (trimmed.toLowerCase() === "/save") {
        await handleSave();
        console.log("");
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "/resume") {
        await handleResume();
        console.log("");
        prompt();
        return;
      }

      if (trimmed.toLowerCase().startsWith("/memory")) {
        const args = trimmed.slice("/memory".length);
        await handleMemory(args);
        console.log("");
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "/agents") {
        handleAgents();
        console.log("");
        prompt();
        return;
      }

      try {
        await chatStreaming(trimmed);
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          console.error(
            red(`\nAPI Error: ${error.status} — ${error.message}\n`)
          );
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
