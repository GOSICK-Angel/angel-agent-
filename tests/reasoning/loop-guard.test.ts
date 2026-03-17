import { describe, it, expect, beforeEach } from "vitest";
import { LoopGuard } from "../../src/reasoning/loop-guard.js";

describe("LoopGuard", () => {
  let guard: LoopGuard;

  beforeEach(() => {
    guard = new LoopGuard({
      maxConsecutiveErrors: 3,
      maxTotalCalls: 10,
      maxRepetitions: 3,
    });
  });

  describe("recordCall", () => {
    it("should allow normal calls", () => {
      const result = guard.recordCall("read_file", { path: "/a" });
      expect(result.stop).toBe(false);
      expect(result.reason).toBe("");
    });

    it("should stop at max total calls", () => {
      for (let i = 0; i < 9; i++) {
        guard.recordCall("read_file", { path: `/file${i}` });
      }
      const result = guard.recordCall("read_file", { path: "/file9" });
      expect(result.stop).toBe(true);
      expect(result.reason).toContain("maximum tool calls");
    });

    it("should detect repeated identical calls", () => {
      guard.recordCall("read_file", { path: "/same" });
      guard.recordCall("read_file", { path: "/same" });
      const result = guard.recordCall("read_file", { path: "/same" });
      expect(result.stop).toBe(true);
      expect(result.reason).toContain("identical input");
    });

    it("should not flag different inputs as repetitions", () => {
      guard.recordCall("read_file", { path: "/a" });
      guard.recordCall("read_file", { path: "/b" });
      const result = guard.recordCall("read_file", { path: "/c" });
      expect(result.stop).toBe(false);
    });
  });

  describe("recordError", () => {
    it("should warn after consecutive errors", () => {
      guard.recordError();
      guard.recordError();
      const result = guard.recordError();
      expect(result.stop).toBe(false);
      expect(result.reason).toContain("consecutive errors");
    });

    it("should not warn below threshold", () => {
      const result = guard.recordError();
      expect(result.reason).toBe("");
    });
  });

  describe("recordSuccess", () => {
    it("should reset consecutive error count", () => {
      guard.recordError();
      guard.recordError();
      guard.recordSuccess();
      const result = guard.recordError();
      expect(result.reason).toBe("");
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      guard.recordCall("read_file", { path: "/a" });
      guard.recordError();
      guard.reset();

      const stats = guard.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.consecutiveErrors).toBe(0);
      expect(stats.uniqueCalls).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should track statistics", () => {
      guard.recordCall("read_file", { path: "/a" });
      guard.recordCall("read_file", { path: "/b" });
      guard.recordCall("read_file", { path: "/a" }); // duplicate
      guard.recordError();

      const stats = guard.getStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.consecutiveErrors).toBe(1);
      expect(stats.uniqueCalls).toBe(2);
    });
  });
});
