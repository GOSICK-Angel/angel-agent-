import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  readAgentConfig,
  parseSections,
  mergeConfigs,
} from "../../src/memory/config-reader.js";

describe("config-reader", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "angel-config-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should parse markdown sections", () => {
    const content = `## Tools
Use TypeScript tools

## Style
Be concise and clear

Some more style notes`;

    const sections = parseSections(content);
    expect(sections["Tools"]).toBe("Use TypeScript tools");
    expect(sections["Style"]).toBe("Be concise and clear\n\nSome more style notes");
  });

  it("should handle content before first heading", () => {
    const content = `Some intro text

## Section
Content here`;

    const sections = parseSections(content);
    expect(Object.keys(sections)).toEqual(["Section"]);
    expect(sections["Section"]).toBe("Content here");
  });

  it("should return empty object for empty content", () => {
    const sections = parseSections("");
    expect(sections).toEqual({});
  });

  it("should read config file from project", async () => {
    const configContent = `## Model
claude-sonnet-4-6

## Instructions
Be helpful`;

    await fs.writeFile(
      path.join(tmpDir, ".angel-agent.md"),
      configContent,
      "utf-8"
    );

    const config = await readAgentConfig(tmpDir);
    expect(config["Model"]).toBe("claude-sonnet-4-6");
    expect(config["Instructions"]).toBe("Be helpful");
  });

  it("should return empty object when config file is missing", async () => {
    const config = await readAgentConfig(tmpDir);
    expect(config).toEqual({});
  });

  it("should merge multiple configs with later ones winning", () => {
    const base = { Model: "haiku", Style: "verbose" };
    const override = { Model: "sonnet", Safety: "strict" };

    const merged = mergeConfigs(base, override);
    expect(merged).toEqual({
      Model: "sonnet",
      Style: "verbose",
      Safety: "strict",
    });
  });
});
