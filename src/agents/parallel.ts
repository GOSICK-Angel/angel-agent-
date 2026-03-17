import type { Tool } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ParallelToolResult } from "./types.js";

export interface ToolUseRequest {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

async function executeSingleTool(
  request: ToolUseRequest,
  tool: Tool,
  permissionManager: PermissionManager
): Promise<ParallelToolResult> {
  try {
    const decision = await permissionManager.checkPermission(tool, request.input);
    if (decision === "deny") {
      return {
        toolUseId: request.id,
        name: request.name,
        result: "Permission denied by user",
        isError: true,
      };
    }
    const result = await tool.execute(request.input);
    return {
      toolUseId: request.id,
      name: request.name,
      result,
      isError: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      toolUseId: request.id,
      name: request.name,
      result: `Error: ${message}`,
      isError: true,
    };
  }
}

export async function executeToolsInParallel(
  toolUses: readonly ToolUseRequest[],
  registry: ToolRegistry,
  permissionManager: PermissionManager
): Promise<ParallelToolResult[]> {
  const readOnly: { request: ToolUseRequest; tool: Tool; index: number }[] = [];
  const sequential: { request: ToolUseRequest; tool: Tool; index: number }[] = [];
  const unknown: { request: ToolUseRequest; index: number }[] = [];

  for (let i = 0; i < toolUses.length; i++) {
    const request = toolUses[i];
    const tool = registry.get(request.name);

    if (!tool) {
      unknown.push({ request, index: i });
    } else if (tool.riskLevel === "read") {
      readOnly.push({ request, tool, index: i });
    } else {
      sequential.push({ request, tool, index: i });
    }
  }

  const results: { index: number; result: ParallelToolResult }[] = [];

  if (readOnly.length > 0) {
    const parallelResults = await Promise.all(
      readOnly.map(async ({ request, tool, index }) => {
        const result = await executeSingleTool(request, tool, permissionManager);
        return { index, result };
      })
    );
    results.push(...parallelResults);
  }

  for (const { request, tool, index } of sequential) {
    const result = await executeSingleTool(request, tool, permissionManager);
    results.push({ index, result });
  }

  for (const { request, index } of unknown) {
    results.push({
      index,
      result: {
        toolUseId: request.id,
        name: request.name,
        result: `Error: Unknown tool: ${request.name}`,
        isError: true,
      },
    });
  }

  return results
    .sort((a, b) => a.index - b.index)
    .map((r) => r.result);
}
