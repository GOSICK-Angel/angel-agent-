import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeFileTool } from "../../src/tools/write-file.js";

const TEST_DIR = path.join(process.cwd(), ".test-tmp", "write-file");

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("write_file tool", () => {
  it("has correct metadata", () => {
    expect(writeFileTool.name).toBe("write_file");
    expect(writeFileTool.riskLevel).toBe("write");
  });

  it("creates a new file", async () => {
    const filePath = path.join(TEST_DIR, "new.txt");
    const result = await writeFileTool.execute({
      path: filePath,
      content: "hello world",
    });
    expect(result).toContain("Created new file");
    expect(result).toContain("11 bytes");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("hello world");
  });

  it("overwrites an existing file", async () => {
    const filePath = path.join(TEST_DIR, "existing.txt");
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(filePath, "old content");

    const result = await writeFileTool.execute({
      path: filePath,
      content: "new content",
    });
    expect(result).toContain("Overwrote existing file");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("new content");
  });

  it("creates parent directories", async () => {
    const filePath = path.join(TEST_DIR, "a", "b", "c.txt");
    const result = await writeFileTool.execute({
      path: filePath,
      content: "deep",
    });
    expect(result).toContain("Created new file");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("rejects invalid input", async () => {
    await expect(writeFileTool.execute({ path: "x" })).rejects.toThrow();
  });
});
