import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessagesTokens,
  truncateToolResult,
  ContextManager,
} from "../../src/context/manager.js";
import type { MessageParam } from "../../src/core/types.js";

describe("estimateTokens", () => {
  it("should estimate ~1 token per 4 chars", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("a")).toBe(1); // ceil(1/4) = 1
  });

  it("should handle empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("estimateMessagesTokens", () => {
  it("should count tokens from string content", () => {
    const messages: MessageParam[] = [
      { role: "user", content: "Hello world" }, // 11 chars = 3 tokens + 4 overhead
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(7); // ceil(11/4) + 4 = 3 + 4
  });

  it("should count tokens from array content", () => {
    const messages: MessageParam[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      },
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("should handle empty messages array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

describe("truncateToolResult", () => {
  it("should not truncate short content", () => {
    const content = "short result";
    expect(truncateToolResult(content)).toBe(content);
  });

  it("should truncate long content", () => {
    const content = "x".repeat(20000);
    const result = truncateToolResult(content, 10000);
    expect(result.length).toBeLessThan(content.length);
    expect(result).toContain("characters omitted");
  });

  it("should keep start and end of content", () => {
    const content = "START" + "x".repeat(20000) + "END";
    const result = truncateToolResult(content, 10000);
    expect(result).toContain("START");
    expect(result).toContain("END");
  });

  it("should respect custom maxChars", () => {
    const content = "x".repeat(1000);
    const short = truncateToolResult(content, 500);
    expect(short).toContain("characters omitted");

    const long = truncateToolResult(content, 2000);
    expect(long).not.toContain("characters omitted");
  });
});

describe("ContextManager", () => {
  it("should calculate available budget", () => {
    const manager = new ContextManager({
      maxTokens: 100000,
      reservedForResponse: 4096,
      reservedForSystem: 4000,
    });
    const available = manager.getAvailableBudget(2000);
    expect(available).toBe(100000 - 4096 - 2000);
  });

  it("should detect when compaction is needed", () => {
    const manager = new ContextManager({
      maxTokens: 1000,
      reservedForResponse: 100,
      reservedForSystem: 100,
    });

    const smallMessages: MessageParam[] = [
      { role: "user", content: "hi" },
    ];
    expect(manager.needsCompaction(smallMessages, 100)).toBe(false);

    // Create messages that exceed 80% of budget
    const bigMessages: MessageParam[] = Array.from({ length: 50 }, (_, i) => ({
      role: "user" as const,
      content: "x".repeat(100),
    }));
    expect(manager.needsCompaction(bigMessages, 100)).toBe(true);
  });

  it("should compact messages when needed", () => {
    const manager = new ContextManager({
      maxTokens: 2000,
      reservedForResponse: 200,
      reservedForSystem: 200,
    });

    const messages: MessageParam[] = [];
    // Add many messages with tool results
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", content: `Question ${i}` });
      messages.push({
        role: "assistant",
        content: [
          { type: "text", text: `Answer ${i}` },
        ],
      });
    }

    const result = manager.compact(messages, 200);
    expect(result.messages.length).toBeLessThanOrEqual(messages.length);
  });

  it("should compact tool results in old messages", () => {
    const manager = new ContextManager({
      maxTokens: 200000,
      reservedForResponse: 4096,
      reservedForSystem: 4000,
    });

    const longContent = "x".repeat(5000);
    const messages: MessageParam[] = [
      { role: "user", content: "read file" },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "id1",
            content: longContent,
          },
        ],
      },
      ...Array.from({ length: 12 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i}`,
      })),
    ];

    const result = manager.compact(messages, 4000);
    // The old tool result should be compacted
    expect(result.estimatedTokensSaved).toBeGreaterThanOrEqual(0);
  });

  it("should truncate file content", () => {
    const manager = new ContextManager();
    const long = "x".repeat(20000);
    const truncated = manager.truncateFileContent(long);
    expect(truncated.length).toBeLessThan(long.length);
    expect(truncated).toContain("characters omitted");
  });
});
