import type { MessageParam } from "../core/types.js";
import type { RiskLevel } from "../tools/types.js";

export type HookType = "pre_tool" | "post_tool" | "pre_api" | "post_api";

export interface HookContext {
  readonly toolName?: string;
  readonly input?: Record<string, unknown>;
  readonly result?: string;
  readonly isError?: boolean;
  readonly messages?: readonly MessageParam[];
}

export interface HookResult {
  readonly proceed: boolean;
  readonly modifiedInput?: Record<string, unknown>;
  readonly modifiedResult?: string;
}

export interface Hook {
  readonly name: string;
  readonly type: HookType;
  readonly handler: (context: HookContext) => Promise<HookResult>;
  readonly priority?: number;
}

export interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly tools: readonly ToolDefinition[];
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly riskLevel: RiskLevel;
  readonly handler: string;
}

export interface AgentDefinition {
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly allowedTools: readonly string[];
  readonly maxTurns: number;
}

export interface MCPRequest {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface MCPResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}
