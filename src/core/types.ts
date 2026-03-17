import Anthropic from "@anthropic-ai/sdk";

export type MessageParam = Anthropic.MessageParam;
export type ContentBlock = Anthropic.ContentBlock;
export type TextBlock = Anthropic.TextBlock;
export type ToolUseBlock = Anthropic.ToolUseBlock;
export type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

export interface AgentConfig {
  model: string;
  maxTokens: number;
  systemPrompt: string;
}

export const DEFAULT_CONFIG: AgentConfig = {
  model: "claude-sonnet-4-6",
  maxTokens: 4096,
  systemPrompt: "You are a helpful coding assistant. Be concise.",
};
