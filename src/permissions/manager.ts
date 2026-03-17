import type { Tool } from "../tools/types.js";
import type { PermissionDecision } from "./types.js";
import { needsConfirmation, alwaysConfirm } from "./classifier.js";
import { askPermission } from "./prompt.js";

export class PermissionManager {
  private sessionAllowed = new Set<string>();

  async checkPermission(
    tool: Tool,
    input: unknown
  ): Promise<PermissionDecision> {
    if (!needsConfirmation(tool.riskLevel)) {
      return "allow";
    }

    if (!alwaysConfirm(tool.riskLevel) && this.sessionAllowed.has(tool.name)) {
      return "allow";
    }

    const detail = this.formatDetail(tool, input);
    const decision = await askPermission(tool.name, detail);

    if (decision === "allow_session") {
      this.sessionAllowed.add(tool.name);
      return "allow";
    }

    return decision;
  }

  isSessionAllowed(toolName: string): boolean {
    return this.sessionAllowed.has(toolName);
  }

  private formatDetail(tool: Tool, input: unknown): string {
    const inp = input as Record<string, unknown>;

    switch (tool.name) {
      case "write_file":
        return `wants to write to ${inp.path}`;
      case "edit_file":
        return `wants to edit ${inp.path}`;
      case "run_command":
        return `wants to execute: ${inp.command}`;
      default:
        return `wants to perform: ${tool.name}`;
    }
  }
}
