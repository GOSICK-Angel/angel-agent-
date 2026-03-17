import { describe, it, expect, afterEach } from "vitest";
import { MCPServer } from "../../src/extensions/mcp-server.js";
import { z } from "zod";
import type { Tool } from "../../src/tools/types.js";

function createTestTool(name: string, result: string): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: z.object({}),
    apiSchema: { type: "object" as const, properties: {} },
    riskLevel: "read",
    execute: async () => result,
  };
}

async function sendRequest(
  port: number,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  const res = await fetch(`http://localhost:${port}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  return res.json();
}

describe("MCPServer", () => {
  let server: MCPServer;
  let port: number;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  async function startServer(): Promise<void> {
    server = new MCPServer();
    port = 30000 + Math.floor(Math.random() * 10000);
    await server.start(port);
  }

  it("should start and stop", async () => {
    await startServer();
    await server.stop();
  });

  it("should handle initialize", async () => {
    await startServer();
    const res = (await sendRequest(port, "initialize")) as {
      result: { protocolVersion: string; serverInfo: { name: string } };
    };
    expect(res.result.protocolVersion).toBe("2024-11-05");
    expect(res.result.serverInfo.name).toBe("angel-agent");
  });

  it("should handle ping", async () => {
    await startServer();
    const res = (await sendRequest(port, "ping")) as { result: unknown };
    expect(res.result).toEqual({});
  });

  it("should list registered tools", async () => {
    await startServer();
    server.registerTool(createTestTool("test_tool", "ok"));

    const res = (await sendRequest(port, "tools/list")) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(res.result.tools).toHaveLength(1);
    expect(res.result.tools[0].name).toBe("test_tool");
  });

  it("should call a tool", async () => {
    await startServer();
    server.registerTool(createTestTool("echo", "hello world"));

    const res = (await sendRequest(port, "tools/call", {
      name: "echo",
      arguments: {},
    })) as {
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(res.result.content[0].text).toBe("hello world");
  });

  it("should return error for unknown method", async () => {
    await startServer();
    const res = (await sendRequest(port, "unknown/method")) as {
      error: { code: number; message: string };
    };
    expect(res.error.code).toBe(-32601);
    expect(res.error.message).toBe("Method not found");
  });

  it("should return error for unknown tool", async () => {
    await startServer();
    const res = (await sendRequest(port, "tools/call", {
      name: "nonexistent",
    })) as {
      error: { code: number; message: string };
    };
    expect(res.error.code).toBe(-32602);
  });
});
