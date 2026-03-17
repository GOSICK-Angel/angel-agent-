import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "../core/types.js";
import type { Tool } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { SubAgentConfig, SubAgent } from "./types.js";
import { LoopGuard } from "../reasoning/loop-guard.js";

const DEFAULT_MAX_TURNS = 10;

export function createSubAgent(config: SubAgentConfig): SubAgent {
  return {
    id: crypto.randomUUID(),
    config,
    status: "idle",
    messages: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    completedAt: null,
    toolCallCount: 0,
  };
}

function filterTools(
  registry: ToolRegistry,
  allowed?: readonly string[]
): Tool[] {
  const allTools = registry.getAll();
  if (!allowed) return allTools;
  return allTools.filter((t) => allowed.includes(t.name));
}

function buildToolsApiFormat(
  tools: Tool[]
): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.apiSchema,
  }));
}

function extractTextResult(
  content: Anthropic.ContentBlock[]
): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function executeToolCall(
  toolUse: Anthropic.ToolUseBlock,
  availableTools: Tool[],
  permissionManager: PermissionManager
): Promise<{ result: string; isError: boolean }> {
  const tool = availableTools.find((t) => t.name === toolUse.name);
  if (!tool) {
    return { result: `Error: Tool "${toolUse.name}" not available for this sub-agent`, isError: true };
  }

  try {
    const decision = await permissionManager.checkPermission(tool, toolUse.input);
    if (decision === "deny") {
      return { result: "Permission denied by user", isError: true };
    }
    const result = await tool.execute(toolUse.input);
    return { result, isError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: `Error: ${message}`, isError: true };
  }
}

export async function runSubAgent(
  agent: SubAgent,
  client: Anthropic,
  registry: ToolRegistry,
  permissionManager: PermissionManager,
  systemPrompt: string
): Promise<SubAgent> {
  const maxTurns = agent.config.maxTurns ?? DEFAULT_MAX_TURNS;
  const availableTools = filterTools(registry, agent.config.allowedTools);
  const apiTools = buildToolsApiFormat(availableTools);
  const model = agent.config.model ?? "claude-sonnet-4-6";
  const loopGuard = new LoopGuard();

  const messages: MessageParam[] = [
    { role: "user", content: agent.config.task },
  ];

  let turnCount = 0;
  let toolCallCount = 0;

  const runningAgent: SubAgent = {
    ...agent,
    status: "running",
    messages,
  };

  try {
    while (turnCount < maxTurns) {
      turnCount++;

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: apiTools.length > 0 ? apiTools : undefined,
        messages: [...messages],
      });

      if (response.stop_reason === "end_turn") {
        const result = extractTextResult(response.content);
        return {
          ...runningAgent,
          status: "completed",
          messages: [...messages, { role: "assistant", content: response.content }],
          result,
          completedAt: Date.now(),
          toolCallCount,
        };
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const guardResult = loopGuard.recordCall(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );

          if (guardResult.stop) {
            return {
              ...runningAgent,
              status: "failed",
              messages: [...messages],
              error: guardResult.reason,
              completedAt: Date.now(),
              toolCallCount,
            };
          }

          const { result, isError } = await executeToolCall(
            toolUse,
            availableTools,
            permissionManager
          );

          if (isError) {
            loopGuard.recordError();
          } else {
            loopGuard.recordSuccess();
          }

          toolCallCount++;
          toolResults.push({
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result,
            is_error: isError,
          });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      return {
        ...runningAgent,
        status: "completed",
        messages: [...messages],
        result: extractTextResult(response.content),
        completedAt: Date.now(),
        toolCallCount,
      };
    }

    return {
      ...runningAgent,
      status: "failed",
      messages: [...messages],
      error: `Exceeded maximum turns (${maxTurns})`,
      completedAt: Date.now(),
      toolCallCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...runningAgent,
      status: "failed",
      messages: [...messages],
      error: message,
      completedAt: Date.now(),
      toolCallCount,
    };
  }
}
