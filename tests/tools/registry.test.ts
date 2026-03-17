import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { Tool } from "../../src/tools/types.js";

function makeTool(name: string): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({}),
    apiSchema: { type: "object" as const, properties: {}, required: [] },
    riskLevel: "read",
    execute: async () => "ok",
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves a tool", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("test_tool");
    registry.register(tool);
    expect(registry.get("test_tool")).toBe(tool);
  });

  it("returns undefined for unknown tool", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("returns all registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a"));
    registry.register(makeTool("b"));
    expect(registry.getAll()).toHaveLength(2);
  });

  it("converts to API format", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("my_tool"));
    const apiTools = registry.toApiFormat();
    expect(apiTools).toHaveLength(1);
    expect(apiTools[0]).toEqual({
      name: "my_tool",
      description: "Test tool: my_tool",
      input_schema: { type: "object", properties: {}, required: [] },
    });
  });

  it("overwrites tool with same name", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("dup"));
    const tool2 = makeTool("dup");
    registry.register(tool2);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get("dup")).toBe(tool2);
  });
});
