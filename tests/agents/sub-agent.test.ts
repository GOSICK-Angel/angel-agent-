import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSubAgent, runSubAgent } from "../../src/agents/sub-agent.js";
import type { SubAgentConfig, SubAgent } from "../../src/agents/types.js";
import type Anthropic from "@anthropic-ai/sdk";

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    name: "test-agent",
    task: "Do something useful",
    ...overrides,
  };
}

function makeRegistry(tools: Array<{ name: string; riskLevel: string }> = []) {
  const toolMap = new Map<string, unknown>();
  for (const t of tools) {
    toolMap.set(t.name, {
      name: t.name,
      description: `Tool ${t.name}`,
      riskLevel: t.riskLevel,
      apiSchema: { type: "object", properties: {} },
      execute: vi.fn().mockResolvedValue(`result from ${t.name}`),
    });
  }
  return {
    get: (name: string) => toolMap.get(name),
    getAll: () => Array.from(toolMap.values()),
    toApiFormat: () =>
      Array.from(toolMap.values()).map((t: unknown) => {
        const tool = t as { name: string; description: string; apiSchema: unknown };
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.apiSchema,
        };
      }),
  } as unknown as import("../../src/tools/registry.js").ToolRegistry;
}

function makePermissionManager() {
  return {
    checkPermission: vi.fn().mockResolvedValue("allow"),
    isSessionAllowed: vi.fn().mockReturnValue(false),
  } as unknown as import("../../src/permissions/manager.js").PermissionManager;
}

describe("createSubAgent", () => {
  it("creates agent with idle status and defaults", () => {
    const config = makeConfig();
    const agent = createSubAgent(config);

    expect(agent.id).toBeTruthy();
    expect(agent.config).toEqual(config);
    expect(agent.status).toBe("idle");
    expect(agent.messages).toEqual([]);
    expect(agent.result).toBeNull();
    expect(agent.error).toBeNull();
    expect(agent.toolCallCount).toBe(0);
    expect(agent.createdAt).toBeGreaterThan(0);
    expect(agent.completedAt).toBeNull();
  });

  it("generates unique IDs for each agent", () => {
    const a = createSubAgent(makeConfig());
    const b = createSubAgent(makeConfig());
    expect(a.id).not.toBe(b.id);
  });

  it("preserves optional config fields", () => {
    const config = makeConfig({
      allowedTools: ["read_file"],
      maxTurns: 5,
      model: "claude-haiku-4-5-20251001",
    });
    const agent = createSubAgent(config);

    expect(agent.config.allowedTools).toEqual(["read_file"]);
    expect(agent.config.maxTurns).toBe(5);
    expect(agent.config.model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("runSubAgent", () => {
  let agent: SubAgent;
  let registry: ReturnType<typeof makeRegistry>;
  let permissionManager: ReturnType<typeof makePermissionManager>;

  beforeEach(() => {
    agent = createSubAgent(makeConfig());
    registry = makeRegistry();
    permissionManager = makePermissionManager();
  });

  function makeClient(responses: Array<Partial<Anthropic.Message>>) {
    let callIndex = 0;
    return {
      messages: {
        create: vi.fn().mockImplementation(async () => {
          const resp = responses[callIndex] ?? responses[responses.length - 1];
          callIndex++;
          return resp;
        }),
      },
    } as unknown as Anthropic;
  }

  it("completes with text result on end_turn", async () => {
    const client = makeClient([
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Task completed" }],
      },
    ]);

    const result = await runSubAgent(
      agent,
      client,
      registry,
      permissionManager,
      "system prompt"
    );

    expect(result.status).toBe("completed");
    expect(result.result).toBe("Task completed");
    expect(result.completedAt).toBeGreaterThan(0);
    expect(result.toolCallCount).toBe(0);
  });

  it("executes tool calls and continues", async () => {
    const readTool = {
      name: "read_file",
      riskLevel: "read",
    };
    registry = makeRegistry([readTool]);

    const client = makeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "read_file", input: { path: "test.txt" } },
        ],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "File contents analyzed" }],
      },
    ]);

    const result = await runSubAgent(
      agent,
      client,
      registry,
      permissionManager,
      "system prompt"
    );

    expect(result.status).toBe("completed");
    expect(result.result).toBe("File contents analyzed");
    expect(result.toolCallCount).toBe(1);
  });

  it("fails when max turns exceeded", async () => {
    agent = createSubAgent(makeConfig({ maxTurns: 1 }));

    const client = makeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "read_file", input: {} },
        ],
      },
    ]);
    registry = makeRegistry([{ name: "read_file", riskLevel: "read" }]);

    const result = await runSubAgent(
      agent,
      client,
      registry,
      permissionManager,
      "system prompt"
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Exceeded maximum turns");
  });

  it("handles API errors gracefully", async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("API connection failed")),
      },
    } as unknown as Anthropic;

    const result = await runSubAgent(
      agent,
      client,
      registry,
      permissionManager,
      "system prompt"
    );

    expect(result.status).toBe("failed");
    expect(result.error).toBe("API connection failed");
  });

  it("filters tools based on allowedTools config", async () => {
    registry = makeRegistry([
      { name: "read_file", riskLevel: "read" },
      { name: "write_file", riskLevel: "write" },
    ]);

    agent = createSubAgent(makeConfig({ allowedTools: ["read_file"] }));

    const client = makeClient([
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Done" }],
      },
    ]);

    await runSubAgent(agent, client, registry, permissionManager, "system prompt");

    const createCall = (client.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const toolNames = createCall.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual(["read_file"]);
    expect(toolNames).not.toContain("write_file");
  });
});
