import { describe, it, expect, vi } from "vitest";
import { PermissionManager } from "../../src/permissions/manager.js";
import type { Tool } from "../../src/tools/types.js";
import { z } from "zod";

vi.mock("../../src/permissions/prompt.js", () => ({
  askPermission: vi.fn(),
}));

import { askPermission } from "../../src/permissions/prompt.js";
const mockAskPermission = vi.mocked(askPermission);

function makeTool(name: string, riskLevel: "read" | "write" | "dangerous"): Tool {
  return {
    name,
    description: `Tool: ${name}`,
    inputSchema: z.object({}),
    apiSchema: { type: "object" as const, properties: {}, required: [] },
    riskLevel,
    execute: async () => "ok",
  };
}

describe("PermissionManager", () => {
  it("auto-allows read tools", async () => {
    const manager = new PermissionManager();
    const tool = makeTool("read_file", "read");
    const decision = await manager.checkPermission(tool, {});
    expect(decision).toBe("allow");
    expect(mockAskPermission).not.toHaveBeenCalled();
  });

  it("prompts for write tools", async () => {
    const manager = new PermissionManager();
    const tool = makeTool("write_file", "write");
    mockAskPermission.mockResolvedValueOnce("allow");

    const decision = await manager.checkPermission(tool, { path: "test.txt" });
    expect(decision).toBe("allow");
    expect(mockAskPermission).toHaveBeenCalledOnce();
  });

  it("remembers session-level allow for write tools", async () => {
    const manager = new PermissionManager();
    const tool = makeTool("write_file", "write");
    mockAskPermission.mockResolvedValueOnce("allow_session");

    await manager.checkPermission(tool, {});
    expect(manager.isSessionAllowed("write_file")).toBe(true);

    mockAskPermission.mockClear();
    const decision = await manager.checkPermission(tool, {});
    expect(decision).toBe("allow");
    expect(mockAskPermission).not.toHaveBeenCalled();
  });

  it("always prompts for dangerous tools even with session allow", async () => {
    const manager = new PermissionManager();
    const tool = makeTool("run_command", "dangerous");
    mockAskPermission.mockResolvedValueOnce("allow_session");

    await manager.checkPermission(tool, { command: "ls" });

    mockAskPermission.mockResolvedValueOnce("allow");
    const decision = await manager.checkPermission(tool, { command: "rm foo" });
    expect(decision).toBe("allow");
    expect(mockAskPermission).toHaveBeenCalledTimes(2);
  });

  it("returns deny when user denies", async () => {
    const manager = new PermissionManager();
    const tool = makeTool("write_file", "write");
    mockAskPermission.mockResolvedValueOnce("deny");

    const decision = await manager.checkPermission(tool, {});
    expect(decision).toBe("deny");
  });
});
