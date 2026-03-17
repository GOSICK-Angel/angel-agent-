import type Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  filter(names: string[]): ToolRegistry {
    const filtered = new ToolRegistry();
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) {
        filtered.register(tool);
      }
    }
    return filtered;
  }

  toApiFormat(): Anthropic.Tool[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.apiSchema,
    }));
  }
}
