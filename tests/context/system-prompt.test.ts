import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/context/system-prompt.js";
import type { Tool } from "../../src/tools/types.js";
import type { ProjectContext, SystemPromptConfig } from "../../src/context/types.js";
import { z } from "zod";

const mockTool: Tool = {
  name: "test_tool",
  description: "A test tool for unit testing",
  inputSchema: z.object({}),
  apiSchema: { type: "object" as const, properties: {} },
  riskLevel: "read",
  execute: async () => "ok",
};

const mockProject: ProjectContext = {
  rootPath: "/tmp/test-project",
  name: "test-project",
  claudeMd: "# Test Instructions\nDo things right.",
  packageJson: { name: "test", dependencies: { zod: "^4.0.0" } },
  gitBranch: "main",
  gitStatus: null,
  hasGit: true,
};

describe("buildSystemPrompt", () => {
  it("should include agent identity by default", () => {
    const prompt = buildSystemPrompt([], null);
    expect(prompt).toContain("Angel Agent");
    expect(prompt).toContain("coding assistant");
  });

  it("should include tool descriptions", () => {
    const prompt = buildSystemPrompt([mockTool], null);
    expect(prompt).toContain("test_tool");
    expect(prompt).toContain("A test tool for unit testing");
    expect(prompt).toContain("read");
  });

  it("should include code style rules", () => {
    const prompt = buildSystemPrompt([], null);
    expect(prompt).toContain("Code Style");
    expect(prompt).toContain("immutable");
  });

  it("should include safety rules", () => {
    const prompt = buildSystemPrompt([], null);
    expect(prompt).toContain("Safety");
    expect(prompt).toContain("NEVER");
  });

  it("should include project context when provided", () => {
    const prompt = buildSystemPrompt([], mockProject);
    expect(prompt).toContain("test-project");
    expect(prompt).toContain("Git branch: main");
    expect(prompt).toContain("Test Instructions");
  });

  it("should truncate long CLAUDE.md content", () => {
    const longProject: ProjectContext = {
      ...mockProject,
      claudeMd: "x".repeat(3000),
    };
    const prompt = buildSystemPrompt([], longProject);
    expect(prompt).toContain("truncated");
  });

  it("should respect config flags", () => {
    const config: SystemPromptConfig = {
      agentIdentity: false,
      toolInstructions: false,
      codeStyleRules: false,
      safetyRules: false,
      projectContext: false,
    };
    const prompt = buildSystemPrompt([mockTool], mockProject, config);
    expect(prompt).not.toContain("Angel Agent");
    expect(prompt).not.toContain("test_tool");
    expect(prompt).not.toContain("Safety");
    expect(prompt).not.toContain("test-project");
  });

  it("should skip tool section when no tools", () => {
    const prompt = buildSystemPrompt([], null);
    expect(prompt).not.toContain("Available Tools");
  });

  it("should include tool usage guidelines when tools exist", () => {
    const prompt = buildSystemPrompt([mockTool], null);
    expect(prompt).toContain("Tool Usage Guidelines");
    expect(prompt).toContain("read-only tools");
  });
});
