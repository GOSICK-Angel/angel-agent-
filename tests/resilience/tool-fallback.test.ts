import { describe, it, expect, beforeEach } from "vitest";
import {
  executeWithFallback,
  getFailureCounts,
  resetFailureCounts,
} from "../../src/resilience/tool-fallback.js";
import type { Tool } from "../../src/tools/types.js";
import { z } from "zod";

function createMockTool(
  executeFn: (input: unknown) => Promise<string>
): Tool {
  return {
    name: "mock-tool",
    description: "A mock tool for testing",
    inputSchema: z.object({}),
    apiSchema: { type: "object" as const, properties: {} },
    riskLevel: "read",
    execute: executeFn,
  };
}

describe("executeWithFallback", () => {
  beforeEach(() => {
    resetFailureCounts();
  });

  it("returns fallbackUsed=false on success", async () => {
    const tool = createMockTool(async () => "done");
    const result = await executeWithFallback(tool, {});
    expect(result.result).toBe("done");
    expect(result.isError).toBe(false);
    expect(result.fallbackUsed).toBe(false);
  });

  it("returns fallbackUsed=true on timeout", async () => {
    const tool = createMockTool(
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 5000))
    );
    const result = await executeWithFallback(tool, {}, { timeout: 100 });
    expect(result.isError).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(result.result).toContain("timed out");
  });

  it("retries on transient error then succeeds", async () => {
    let calls = 0;
    const tool = createMockTool(async () => {
      calls++;
      if (calls === 1) {
        throw new Error("transient");
      }
      return "recovered";
    });
    const result = await executeWithFallback(tool, {}, { retries: 1 });
    expect(result.result).toBe("recovered");
    expect(result.isError).toBe(false);
    expect(result.fallbackUsed).toBe(false);
  });

  it("tracks failure counts", async () => {
    const tool = createMockTool(async () => {
      throw new Error("fail");
    });
    await executeWithFallback(tool, {}, { retries: 0 });
    await executeWithFallback(tool, {}, { retries: 0 });
    const counts = getFailureCounts();
    expect(counts.get("mock-tool")).toBe(2);
  });

  it("resets failure counts", async () => {
    const tool = createMockTool(async () => {
      throw new Error("fail");
    });
    await executeWithFallback(tool, {}, { retries: 0 });
    expect(getFailureCounts().get("mock-tool")).toBe(1);
    resetFailureCounts();
    expect(getFailureCounts().size).toBe(0);
  });

  it("returns error result after all retries exhausted", async () => {
    const tool = createMockTool(async () => {
      throw new Error("persistent failure");
    });
    const result = await executeWithFallback(tool, {}, { retries: 2 });
    expect(result.isError).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(result.originalError).toBe("persistent failure");
  });
});
