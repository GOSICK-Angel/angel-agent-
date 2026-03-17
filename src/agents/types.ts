import type { MessageParam } from "../core/types.js";

export type AgentStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface SubAgentConfig {
  readonly name: string;
  readonly task: string;
  readonly allowedTools?: readonly string[];
  readonly maxTurns?: number;
  readonly model?: string;
}

export interface SubAgent {
  readonly id: string;
  readonly config: SubAgentConfig;
  readonly status: AgentStatus;
  readonly messages: readonly MessageParam[];
  readonly result: string | null;
  readonly error: string | null;
  readonly createdAt: number;
  readonly completedAt: number | null;
  readonly toolCallCount: number;
}

export interface AgentMessage {
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly content: string;
  readonly timestamp: number;
}

export interface SpawnResult {
  readonly success: boolean;
  readonly agentId: string;
  readonly error?: string;
}

export interface ParallelToolResult {
  readonly toolUseId: string;
  readonly name: string;
  readonly result: string;
  readonly isError: boolean;
}
