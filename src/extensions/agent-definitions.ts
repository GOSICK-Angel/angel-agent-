import fs from "node:fs/promises";
import path from "node:path";
import type { AgentDefinition } from "./types.js";

export function parseAgentDefinition(
  content: string,
  filename: string
): AgentDefinition {
  const lines = content.split("\n");

  let name = path.basename(filename, ".md");
  let description = "";
  let systemPrompt = "";
  let allowedTools: string[] = [];
  let maxTurns = 10;

  let currentSection = "";
  const sectionContent: string[] = [];

  const flushSection = (): void => {
    const text = sectionContent.join("\n").trim();
    switch (currentSection) {
      case "description":
        description = text;
        break;
      case "system prompt":
        systemPrompt = text;
        break;
      case "allowed tools":
        allowedTools = text
          .split("\n")
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean);
        break;
      case "max turns": {
        const parsed = parseInt(text, 10);
        if (!isNaN(parsed)) maxTurns = parsed;
        break;
      }
    }
    sectionContent.length = 0;
  };

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      name = h1Match[1].trim();
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      flushSection();
      currentSection = h2Match[1].trim().toLowerCase();
      continue;
    }

    if (currentSection) {
      sectionContent.push(line);
    }
  }

  flushSection();

  return { name, description, systemPrompt, allowedTools, maxTurns };
}

export async function loadAgentDefinitions(
  projectDir: string
): Promise<AgentDefinition[]> {
  const agentsDir = path.join(projectDir, ".angel-agent", "agents");

  try {
    await fs.access(agentsDir);
  } catch {
    return [];
  }

  const entries = await fs.readdir(agentsDir);
  const definitions: AgentDefinition[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const content = await fs.readFile(path.join(agentsDir, entry), "utf-8");
    definitions.push(parseAgentDefinition(content, entry));
  }

  return definitions;
}
