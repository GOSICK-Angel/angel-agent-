import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { detectProject, formatProjectSummary } from "../../src/context/project.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("detectProject", () => {
  it("should detect project name from directory", async () => {
    const ctx = await detectProject(ROOT);
    expect(ctx.name).toBe("angel-agent-");
  });

  it("should detect git repo", async () => {
    const ctx = await detectProject(ROOT);
    expect(ctx.hasGit).toBe(true);
    expect(ctx.gitBranch).toBeTruthy();
  });

  it("should read package.json", async () => {
    const ctx = await detectProject(ROOT);
    expect(ctx.packageJson).not.toBeNull();
    expect(ctx.packageJson?.name).toBe("angel-agent");
  });

  it("should read CLAUDE.md if present", async () => {
    const ctx = await detectProject(ROOT);
    expect(ctx.claudeMd).not.toBeNull();
    expect(ctx.claudeMd).toContain("Angel Agent");
  });

  it("should handle non-existent directory gracefully", async () => {
    const ctx = await detectProject("/tmp/nonexistent-project-12345");
    expect(ctx.name).toBe("nonexistent-project-12345");
    expect(ctx.hasGit).toBe(false);
    expect(ctx.packageJson).toBeNull();
    expect(ctx.claudeMd).toBeNull();
  });
});

describe("formatProjectSummary", () => {
  it("should format project with all fields", async () => {
    const ctx = await detectProject(ROOT);
    const summary = formatProjectSummary(ctx);

    expect(summary).toContain("Project: angel-agent-");
    expect(summary).toContain("Git branch:");
    expect(summary).toContain("Dependencies:");
  });

  it("should handle project without git", () => {
    const summary = formatProjectSummary({
      rootPath: "/tmp/test",
      name: "test-project",
      claudeMd: null,
      packageJson: null,
      gitBranch: null,
      gitStatus: null,
      hasGit: false,
    });

    expect(summary).toContain("Project: test-project");
    expect(summary).not.toContain("Git");
  });

  it("should show clean git status", () => {
    const summary = formatProjectSummary({
      rootPath: "/tmp/test",
      name: "test",
      claudeMd: null,
      packageJson: null,
      gitBranch: "main",
      gitStatus: null,
      hasGit: true,
    });

    expect(summary).toContain("Git status: clean");
  });

  it("should show changed file count", () => {
    const summary = formatProjectSummary({
      rootPath: "/tmp/test",
      name: "test",
      claudeMd: null,
      packageJson: null,
      gitBranch: "main",
      gitStatus: "M src/file.ts\nA src/new.ts",
      hasGit: true,
    });

    expect(summary).toContain("2 changed file(s)");
  });
});
