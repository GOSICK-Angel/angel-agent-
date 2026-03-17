import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { editFileTool } from "../../src/tools/edit-file.js";

const TEST_DIR = path.join(process.cwd(), ".test-tmp");

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeTestFile(name: string, content: string): string {
  const filePath = path.join(TEST_DIR, name);
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("edit_file tool", () => {
  it("has correct metadata", () => {
    expect(editFileTool.name).toBe("edit_file");
    expect(editFileTool.riskLevel).toBe("write");
  });

  it("replaces a unique string", async () => {
    const filePath = writeTestFile("test.txt", "hello world");
    const result = await editFileTool.execute({
      path: filePath,
      old_string: "hello",
      new_string: "goodbye",
    });
    expect(result).toContain("Edited");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("goodbye world");
  });

  it("errors when old_string not found", async () => {
    const filePath = writeTestFile("test.txt", "hello world");
    const result = await editFileTool.execute({
      path: filePath,
      old_string: "missing",
      new_string: "replacement",
    });
    expect(result).toContain("Error: old_string not found");
  });

  it("errors when old_string matches multiple times", async () => {
    const filePath = writeTestFile("test.txt", "aaa bbb aaa");
    const result = await editFileTool.execute({
      path: filePath,
      old_string: "aaa",
      new_string: "ccc",
    });
    expect(result).toContain("appears multiple times");
  });

  it("errors for non-existent file", async () => {
    const result = await editFileTool.execute({
      path: path.join(TEST_DIR, "nope.txt"),
      old_string: "x",
      new_string: "y",
    });
    expect(result).toContain("Error: File not found");
  });

  it("rejects invalid input", async () => {
    await expect(editFileTool.execute({ path: "x" })).rejects.toThrow();
  });
});
