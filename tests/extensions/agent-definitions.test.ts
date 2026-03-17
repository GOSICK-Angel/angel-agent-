import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  parseAgentDefinition,
  loadAgentDefinitions,
} from "../../src/extensions/agent-definitions.js";

describe("parseAgentDefinition", () => {
  it("should parse a full agent definition", () => {
    const content = `# Research Agent

## Description
An agent that researches topics.

## System Prompt
You are a research assistant. Find relevant information.

## Allowed Tools
- web_search
- read_file
- grep_search

## Max Turns
15
`;

    const result = parseAgentDefinition(content, "researcher.md");
    expect(result.name).toBe("Research Agent");
    expect(result.description).toBe("An agent that researches topics.");
    expect(result.systemPrompt).toBe(
      "You are a research assistant. Find relevant information."
    );
    expect(result.allowedTools).toEqual([
      "web_search",
      "read_file",
      "grep_search",
    ]);
    expect(result.maxTurns).toBe(15);
  });

  it("should use defaults for minimal markdown", () => {
    const content = `# Simple Agent

## Description
A simple agent.
`;

    const result = parseAgentDefinition(content, "simple.md");
    expect(result.name).toBe("Simple Agent");
    expect(result.description).toBe("A simple agent.");
    expect(result.systemPrompt).toBe("");
    expect(result.allowedTools).toEqual([]);
    expect(result.maxTurns).toBe(10);
  });

  it("should use filename as name when no H1", () => {
    const content = `## Description
No heading agent.
`;

    const result = parseAgentDefinition(content, "fallback.md");
    expect(result.name).toBe("fallback");
  });
});

describe("loadAgentDefinitions", () => {
  it("should return empty array for nonexistent dir", async () => {
    const result = await loadAgentDefinitions("/nonexistent/path");
    expect(result).toEqual([]);
  });

  it("should load agent definitions from temp dir", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-test-"));
    const agentsDir = path.join(tmpDir, ".angel-agent", "agents");
    await fs.mkdir(agentsDir, { recursive: true });

    await fs.writeFile(
      path.join(agentsDir, "test-agent.md"),
      `# Test Agent

## Description
A test agent.

## System Prompt
You are a test agent.

## Allowed Tools
- read_file

## Max Turns
5
`
    );

    const definitions = await loadAgentDefinitions(tmpDir);
    expect(definitions).toHaveLength(1);
    expect(definitions[0].name).toBe("Test Agent");
    expect(definitions[0].maxTurns).toBe(5);

    await fs.rm(tmpDir, { recursive: true });
  });
});
