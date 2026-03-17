import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadMemory,
  saveFact,
  removeFact,
  getFact,
  persistMemory,
  formatMemoryForPrompt,
} from "../../src/memory/project-memory.js";
import type { ProjectMemoryData } from "../../src/memory/types.js";

describe("project-memory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "angel-memory-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should return empty memory for new project", async () => {
    const data = await loadMemory(tmpDir);
    expect(data.projectPath).toBe(tmpDir);
    expect(data.facts).toEqual([]);
  });

  it("should save and load memory round-trip", async () => {
    let data = await loadMemory(tmpDir);
    data = saveFact(data, "framework", "React", "user");
    await persistMemory(data);

    const loaded = await loadMemory(tmpDir);
    expect(loaded.facts).toHaveLength(1);
    expect(loaded.facts[0].key).toBe("framework");
    expect(loaded.facts[0].value).toBe("React");
  });

  it("should not mutate original data when saving fact", () => {
    const data: ProjectMemoryData = {
      projectPath: tmpDir,
      facts: [],
      updatedAt: Date.now(),
    };

    const updated = saveFact(data, "lang", "TypeScript", "agent");
    expect(data.facts).toHaveLength(0);
    expect(updated.facts).toHaveLength(1);
    expect(updated).not.toBe(data);
  });

  it("should overwrite existing fact with same key", () => {
    let data: ProjectMemoryData = {
      projectPath: tmpDir,
      facts: [],
      updatedAt: Date.now(),
    };

    data = saveFact(data, "db", "PostgreSQL", "user");
    data = saveFact(data, "db", "MySQL", "user");

    expect(data.facts).toHaveLength(1);
    expect(data.facts[0].value).toBe("MySQL");
  });

  it("should remove a fact", () => {
    let data: ProjectMemoryData = {
      projectPath: tmpDir,
      facts: [],
      updatedAt: Date.now(),
    };

    data = saveFact(data, "a", "1", "user");
    data = saveFact(data, "b", "2", "user");
    const removed = removeFact(data, "a");

    expect(removed.facts).toHaveLength(1);
    expect(removed.facts[0].key).toBe("b");
    expect(data.facts).toHaveLength(2);
  });

  it("should get a specific fact", () => {
    let data: ProjectMemoryData = {
      projectPath: tmpDir,
      facts: [],
      updatedAt: Date.now(),
    };
    data = saveFact(data, "key1", "val1", "config");

    expect(getFact(data, "key1")?.value).toBe("val1");
    expect(getFact(data, "missing")).toBeUndefined();
  });

  it("should format memory for prompt", () => {
    let data: ProjectMemoryData = {
      projectPath: tmpDir,
      facts: [],
      updatedAt: Date.now(),
    };
    data = saveFact(data, "framework", "React", "user");
    data = saveFact(data, "db", "PostgreSQL", "agent");

    const formatted = formatMemoryForPrompt(data);
    expect(formatted).toContain("## Project Memory");
    expect(formatted).toContain("framework: React");
    expect(formatted).toContain("db: PostgreSQL");
  });

  it("should return empty string for empty memory", () => {
    const data: ProjectMemoryData = {
      projectPath: tmpDir,
      facts: [],
      updatedAt: Date.now(),
    };
    expect(formatMemoryForPrompt(data)).toBe("");
  });
});
