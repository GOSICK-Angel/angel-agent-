import * as fs from "node:fs/promises";
import * as path from "node:path";

const CONFIG_FILE = ".angel-agent.md";

export async function readAgentConfig(
  projectPath: string
): Promise<Record<string, string>> {
  const filePath = path.join(projectPath, CONFIG_FILE);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return parseSections(content);
  } catch {
    return {};
  }
}

export function parseSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split("\n");
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      if (currentKey !== null) {
        sections[currentKey] = currentLines.join("\n").trim();
      }
      currentKey = match[1].trim();
      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    sections[currentKey] = currentLines.join("\n").trim();
  }

  return sections;
}

export function mergeConfigs(
  ...configs: Record<string, string>[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const config of configs) {
    for (const [key, value] of Object.entries(config)) {
      result[key] = value;
    }
  }
  return result;
}
