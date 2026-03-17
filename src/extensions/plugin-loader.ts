import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool, RiskLevel } from "../tools/types.js";
import type { PluginManifest } from "./types.js";

const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  riskLevel: z.enum(["read", "write", "dangerous"]),
  handler: z.string(),
});

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  tools: z.array(toolDefinitionSchema),
});

export function validateManifest(raw: unknown): PluginManifest {
  return manifestSchema.parse(raw) as PluginManifest;
}

export async function loadPlugins(pluginDir: string): Promise<Tool[]> {
  try {
    await fs.access(pluginDir);
  } catch {
    return [];
  }

  const entries = await fs.readdir(pluginDir, { withFileTypes: true });
  const tools: Tool[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(pluginDir, entry.name, "manifest.json");

    try {
      const raw = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
      const manifest = validateManifest(raw);

      for (const toolDef of manifest.tools) {
        const handlerPath = path.join(pluginDir, entry.name, toolDef.handler);
        const riskLevel: RiskLevel = toolDef.riskLevel;

        const tool: Tool = {
          name: toolDef.name,
          description: toolDef.description,
          inputSchema: z.record(z.string(), z.unknown()),
          apiSchema: toolDef.inputSchema as Tool["apiSchema"],
          riskLevel,
          execute: async (input: unknown): Promise<string> => {
            const mod = await import(handlerPath);
            return mod.default(input);
          },
        };

        tools.push(tool);
      }
    } catch (err) {
      console.warn(
        `Skipping invalid plugin "${entry.name}":`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return tools;
}
