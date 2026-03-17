import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentCoordinator } from "../../src/agents/coordinator.js";
import type { SubAgentConfig } from "../../src/agents/types.js";
import type Anthropic from "@anthropic-ai/sdk";

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    name: "test-agent",
    task: "Do something",
    ...overrides,
  };
}

function makeRegistry() {
  return {
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    toApiFormat: vi.fn().mockReturnValue([]),
  } as unknown as import("../../src/tools/registry.js").ToolRegistry;
}

function makePermissionManager() {
  return {
    checkPermission: vi.fn().mockResolvedValue("allow"),
    isSessionAllowed: vi.fn().mockReturnValue(false),
  } as unknown as import("../../src/permissions/manager.js").PermissionManager;
}

function makeClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Done" }],
      }),
    },
  } as unknown as Anthropic;
}

describe("AgentCoordinator", () => {
  let coordinator: AgentCoordinator;

  beforeEach(() => {
    coordinator = new AgentCoordinator();
  });

  it("spawns agents and returns SpawnResult", () => {
    const result = coordinator.spawn(makeConfig());

    expect(result.success).toBe(true);
    expect(result.agentId).toBeTruthy();
    expect(result.error).toBeUndefined();
  });

  it("retrieves spawned agents by id", () => {
    const { agentId } = coordinator.spawn(makeConfig({ name: "agent-1" }));

    const agent = coordinator.getAgent(agentId);
    expect(agent).toBeDefined();
    expect(agent!.config.name).toBe("agent-1");
    expect(agent!.status).toBe("idle");
  });

  it("returns undefined for unknown agent id", () => {
    expect(coordinator.getAgent("nonexistent")).toBeUndefined();
  });

  it("lists all agents", () => {
    coordinator.spawn(makeConfig({ name: "a" }));
    coordinator.spawn(makeConfig({ name: "b" }));

    const all = coordinator.getAllAgents();
    expect(all).toHaveLength(2);
  });

  it("filters agents by status", () => {
    coordinator.spawn(makeConfig({ name: "idle-1" }));
    coordinator.spawn(makeConfig({ name: "idle-2" }));

    const idle = coordinator.getAgentsByStatus("idle");
    expect(idle).toHaveLength(2);

    const running = coordinator.getAgentsByStatus("running");
    expect(running).toHaveLength(0);
  });

  it("sends and retrieves messages between agents", () => {
    const r1 = coordinator.spawn(makeConfig({ name: "sender" }));
    const r2 = coordinator.spawn(makeConfig({ name: "receiver" }));

    const msg = coordinator.sendMessage(r1.agentId, r2.agentId, "Hello there");

    expect(msg.fromAgentId).toBe(r1.agentId);
    expect(msg.toAgentId).toBe(r2.agentId);
    expect(msg.content).toBe("Hello there");
    expect(msg.timestamp).toBeGreaterThan(0);

    const senderMsgs = coordinator.getMessages(r1.agentId);
    expect(senderMsgs).toHaveLength(1);

    const receiverMsgs = coordinator.getMessages(r2.agentId);
    expect(receiverMsgs).toHaveLength(1);
    expect(receiverMsgs[0].content).toBe("Hello there");
  });

  it("runs agent and updates status", async () => {
    const { agentId } = coordinator.spawn(makeConfig());
    const client = makeClient();
    const registry = makeRegistry();
    const pm = makePermissionManager();

    const result = await coordinator.runAgent(
      agentId,
      client,
      registry,
      pm,
      "system prompt"
    );

    expect(result.status).toBe("completed");
    expect(result.result).toBe("Done");

    const stored = coordinator.getAgent(agentId);
    expect(stored!.status).toBe("completed");
  });

  it("throws when running unknown agent", async () => {
    const client = makeClient();
    const registry = makeRegistry();
    const pm = makePermissionManager();

    await expect(
      coordinator.runAgent("bad-id", client, registry, pm, "prompt")
    ).rejects.toThrow("Agent not found");
  });
});
