import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProjectMemoryData, ProjectFact } from "./types.js";

const MEMORY_FILE = ".angel-agent/memory.json";

function getMemoryPath(projectPath: string): string {
  return path.join(projectPath, MEMORY_FILE);
}

export async function loadMemory(
  projectPath: string
): Promise<ProjectMemoryData> {
  const filePath = getMemoryPath(projectPath);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as ProjectMemoryData;
  } catch {
    return {
      projectPath,
      facts: [],
      updatedAt: Date.now(),
    };
  }
}

export function saveFact(
  data: ProjectMemoryData,
  key: string,
  value: string,
  source: ProjectFact["source"]
): ProjectMemoryData {
  const now = Date.now();
  const existingIndex = data.facts.findIndex((f) => f.key === key);
  const newFact: ProjectFact = { key, value, createdAt: now, source };

  const newFacts =
    existingIndex >= 0
      ? data.facts.map((f, i) => (i === existingIndex ? newFact : f))
      : [...data.facts, newFact];

  return {
    ...data,
    facts: newFacts,
    updatedAt: now,
  };
}

export function removeFact(
  data: ProjectMemoryData,
  key: string
): ProjectMemoryData {
  return {
    ...data,
    facts: data.facts.filter((f) => f.key !== key),
    updatedAt: Date.now(),
  };
}

export function getFact(
  data: ProjectMemoryData,
  key: string
): ProjectFact | undefined {
  return data.facts.find((f) => f.key === key);
}

export async function persistMemory(
  data: ProjectMemoryData
): Promise<void> {
  const filePath = getMemoryPath(data.projectPath);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function formatMemoryForPrompt(data: ProjectMemoryData): string {
  if (data.facts.length === 0) return "";

  const lines = data.facts.map(
    (f) => `- ${f.key}: ${f.value} (source: ${f.source})`
  );
  return `## Project Memory\n\n${lines.join("\n")}`;
}
