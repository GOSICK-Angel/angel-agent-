import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { readFileTool } from "../../src/tools/read-file.js";

describe("read_file tool", () => {
  it("has correct metadata", () => {
    expect(readFileTool.name).toBe("read_file");
    expect(readFileTool.riskLevel).toBe("read");
  });

  it("reads an existing file", async () => {
    const result = await readFileTool.execute({ path: "package.json" });
    expect(result).toContain("angel-agent");
  });

  it("returns error for non-existent file", async () => {
    const result = await readFileTool.execute({ path: "nonexistent.txt" });
    expect(result).toContain("Error: File not found");
  });

  it("returns error for directory", async () => {
    const result = await readFileTool.execute({ path: "src" });
    expect(result).toContain("is a directory");
  });

  it("rejects invalid input", async () => {
    await expect(readFileTool.execute({})).rejects.toThrow();
  });
});
