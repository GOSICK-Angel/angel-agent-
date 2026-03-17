import { describe, it, expect } from "vitest";
import { runCommandTool } from "../../src/tools/run-command.js";

describe("run_command tool", () => {
  it("has correct metadata", () => {
    expect(runCommandTool.name).toBe("run_command");
    expect(runCommandTool.riskLevel).toBe("dangerous");
  });

  it("executes a simple command", async () => {
    const result = await runCommandTool.execute({ command: "echo hello" });
    expect(result).toBe("hello");
  });

  it("returns error on failure", async () => {
    const result = await runCommandTool.execute({ command: "echo fail >&2 && exit 1" });
    expect(result).toContain("Exit code:");
    expect(result).toContain("fail");
  });

  it("rejects dangerous commands", async () => {
    const result = await runCommandTool.execute({ command: "rm -rf /" });
    expect(result).toContain("Command rejected");
  });

  it("rejects mkfs commands", async () => {
    const result = await runCommandTool.execute({ command: "mkfs.ext4 /dev/sda" });
    expect(result).toContain("Command rejected");
  });

  it("captures stderr", async () => {
    const result = await runCommandTool.execute({
      command: "ls nonexistent_file_xyz 2>&1 || true",
    });
    expect(result.length).toBeGreaterThan(0);
  });

  it("rejects invalid input", async () => {
    await expect(runCommandTool.execute({})).rejects.toThrow();
  });
});
