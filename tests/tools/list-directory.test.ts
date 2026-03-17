import { describe, it, expect } from "vitest";
import { listDirectoryTool } from "../../src/tools/list-directory.js";

describe("list_directory tool", () => {
  it("has correct metadata", () => {
    expect(listDirectoryTool.name).toBe("list_directory");
    expect(listDirectoryTool.riskLevel).toBe("read");
  });

  it("lists current directory", async () => {
    const result = await listDirectoryTool.execute({ path: "." });
    expect(result).toContain("package.json");
    expect(result).toContain("[dir]");
    expect(result).toContain("src");
  });

  it("returns error for non-existent directory", async () => {
    const result = await listDirectoryTool.execute({ path: "nonexistent_dir" });
    expect(result).toContain("Error: Directory not found");
  });

  it("rejects invalid input", async () => {
    await expect(listDirectoryTool.execute({})).rejects.toThrow();
  });
});
