import { describe, it, expect, vi } from "vitest";
import {
  executeToolsInParallel,
  type ToolUseRequest,
} from "../../src/agents/parallel.js";

function makeTool(name: string, riskLevel: string, executeFn?: () => Promise<string>) {
  return {
    name,
    description: `Tool ${name}`,
    riskLevel,
    apiSchema: { type: "object", properties: {} },
    inputSchema: {} as never,
    execute: executeFn ?? vi.fn().mockResolvedValue(`result from ${name}`),
  };
}

function makeRegistry(tools: ReturnType<typeof makeTool>[]) {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  return {
    get: (name: string) => toolMap.get(name),
    getAll: () => Array.from(toolMap.values()),
  } as unknown as import("../../src/tools/registry.js").ToolRegistry;
}

function makePermissionManager() {
  return {
    checkPermission: vi.fn().mockResolvedValue("allow"),
    isSessionAllowed: vi.fn().mockReturnValue(false),
  } as unknown as import("../../src/permissions/manager.js").PermissionManager;
}

function makeRequest(id: string, name: string): ToolUseRequest {
  return { id, name, input: {} };
}

describe("executeToolsInParallel", () => {
  it("executes read-only tools in parallel", async () => {
    const executionOrder: string[] = [];

    const tool1 = makeTool("read_a", "read", async () => {
      executionOrder.push("read_a");
      return "result_a";
    });
    const tool2 = makeTool("read_b", "read", async () => {
      executionOrder.push("read_b");
      return "result_b";
    });

    const registry = makeRegistry([tool1, tool2]);
    const pm = makePermissionManager();

    const results = await executeToolsInParallel(
      [makeRequest("1", "read_a"), makeRequest("2", "read_b")],
      registry,
      pm
    );

    expect(results).toHaveLength(2);
    expect(results[0].result).toBe("result_a");
    expect(results[1].result).toBe("result_b");
    expect(results[0].isError).toBe(false);
    expect(results[1].isError).toBe(false);
  });

  it("executes write tools sequentially", async () => {
    const executionOrder: string[] = [];

    const tool1 = makeTool("write_a", "write", async () => {
      executionOrder.push("write_a_start");
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push("write_a_end");
      return "written_a";
    });
    const tool2 = makeTool("write_b", "write", async () => {
      executionOrder.push("write_b_start");
      return "written_b";
    });

    const registry = makeRegistry([tool1, tool2]);
    const pm = makePermissionManager();

    const results = await executeToolsInParallel(
      [makeRequest("1", "write_a"), makeRequest("2", "write_b")],
      registry,
      pm
    );

    expect(results[0].result).toBe("written_a");
    expect(results[1].result).toBe("written_b");
    expect(executionOrder).toEqual([
      "write_a_start",
      "write_a_end",
      "write_b_start",
    ]);
  });

  it("handles mixed read and write tools", async () => {
    const readTool = makeTool("read_file", "read");
    const writeTool = makeTool("write_file", "write");

    const registry = makeRegistry([readTool, writeTool]);
    const pm = makePermissionManager();

    const results = await executeToolsInParallel(
      [makeRequest("1", "read_file"), makeRequest("2", "write_file")],
      registry,
      pm
    );

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("read_file");
    expect(results[1].name).toBe("write_file");
  });

  it("returns error for unknown tools", async () => {
    const registry = makeRegistry([]);
    const pm = makePermissionManager();

    const results = await executeToolsInParallel(
      [makeRequest("1", "unknown_tool")],
      registry,
      pm
    );

    expect(results).toHaveLength(1);
    expect(results[0].isError).toBe(true);
    expect(results[0].result).toContain("Unknown tool");
  });

  it("preserves original order of results", async () => {
    const readTool = makeTool("read_file", "read", async () => {
      await new Promise((r) => setTimeout(r, 20));
      return "slow_read";
    });
    const writeTool = makeTool("write_file", "write");

    const registry = makeRegistry([readTool, writeTool]);
    const pm = makePermissionManager();

    const results = await executeToolsInParallel(
      [
        makeRequest("1", "read_file"),
        makeRequest("2", "write_file"),
        makeRequest("3", "read_file"),
      ],
      registry,
      pm
    );

    expect(results[0].toolUseId).toBe("1");
    expect(results[0].name).toBe("read_file");
    expect(results[1].toolUseId).toBe("2");
    expect(results[1].name).toBe("write_file");
    expect(results[2].toolUseId).toBe("3");
    expect(results[2].name).toBe("read_file");
  });

  it("handles tool execution errors", async () => {
    const failTool = makeTool("fail_tool", "read", async () => {
      throw new Error("execution failed");
    });

    const registry = makeRegistry([failTool]);
    const pm = makePermissionManager();

    const results = await executeToolsInParallel(
      [makeRequest("1", "fail_tool")],
      registry,
      pm
    );

    expect(results[0].isError).toBe(true);
    expect(results[0].result).toContain("execution failed");
  });

  it("handles permission denial", async () => {
    const tool = makeTool("write_file", "write");
    const registry = makeRegistry([tool]);
    const pm = makePermissionManager();
    (pm.checkPermission as ReturnType<typeof vi.fn>).mockResolvedValue("deny");

    const results = await executeToolsInParallel(
      [makeRequest("1", "write_file")],
      registry,
      pm
    );

    expect(results[0].isError).toBe(true);
    expect(results[0].result).toContain("Permission denied");
  });

  it("handles empty tool list", async () => {
    const registry = makeRegistry([]);
    const pm = makePermissionManager();

    const results = await executeToolsInParallel([], registry, pm);
    expect(results).toEqual([]);
  });
});
