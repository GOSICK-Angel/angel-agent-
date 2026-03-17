import { describe, it, expect } from "vitest";
import {
  formatToolCall,
  formatToolResult,
  formatToolError,
  formatLoopWarning,
} from "../../src/ui/tool-display.js";

describe("formatToolCall", () => {
  it("should format tool name and params", () => {
    const output = formatToolCall("read_file", { path: "/src/index.ts" });
    expect(output).toContain("read_file");
    expect(output).toContain("/src/index.ts");
  });

  it("should handle empty params", () => {
    const output = formatToolCall("list_dir", {});
    expect(output).toContain("list_dir");
    expect(output).toContain("no params");
  });

  it("should truncate long string values", () => {
    const longValue = "x".repeat(100);
    const output = formatToolCall("write_file", { content: longValue });
    expect(output).toContain("...");
  });
});

describe("formatToolResult", () => {
  it("should format success result", () => {
    const output = formatToolResult("read_file", "file contents here");
    expect(output).toContain("read_file");
    expect(output).toContain("✓");
    expect(output).toContain("file contents here");
  });

  it("should truncate long results", () => {
    const longResult = "x".repeat(300);
    const output = formatToolResult("read_file", longResult);
    expect(output).toContain("...");
  });
});

describe("formatToolError", () => {
  it("should format error with tool name", () => {
    const output = formatToolError("write_file", "Permission denied");
    expect(output).toContain("write_file");
    expect(output).toContain("✗");
    expect(output).toContain("Permission denied");
  });
});

describe("formatLoopWarning", () => {
  it("should format warning message", () => {
    const output = formatLoopWarning("Too many errors");
    expect(output).toContain("Loop guard");
    expect(output).toContain("Too many errors");
  });
});
