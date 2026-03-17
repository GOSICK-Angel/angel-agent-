import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "../core/types.js";
import type { TokenBudget, CompactionResult } from "./types.js";
import { DEFAULT_TOKEN_BUDGET } from "./types.js";

/**
 * Estimate token count from a string.
 * Rough heuristic: ~4 characters per token for English text.
 * This avoids needing a tokenizer dependency.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract the text content from a message for token estimation.
 */
function messageToText(message: MessageParam): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }
        const b = block as unknown as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          return b.text;
        }
        if (b.type === "tool_use") {
          return JSON.stringify(b.input ?? {});
        }
        if (b.type === "tool_result") {
          return typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
        }
        return JSON.stringify(b);
      })
      .join("\n");
  }

  return JSON.stringify(message.content);
}

/**
 * Estimate total tokens for a message array.
 */
export function estimateMessagesTokens(messages: MessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(messageToText(msg));
    total += 4; // overhead per message (role, formatting)
  }
  return total;
}

/**
 * Truncate a tool result string if it exceeds the limit.
 */
export function truncateToolResult(
  content: string,
  maxChars: number = 10000
): string {
  if (content.length <= maxChars) {
    return content;
  }
  const half = Math.floor(maxChars / 2);
  const omitted = content.length - maxChars;
  return (
    content.slice(0, half) +
    `\n\n... [${omitted} characters omitted] ...\n\n` +
    content.slice(-half)
  );
}

/**
 * Summarize old tool results to save tokens.
 * Replaces verbose tool outputs with a short summary.
 */
function compactToolResult(block: Anthropic.ToolResultBlockParam): Anthropic.ToolResultBlockParam {
  const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);

  if (content.length <= 500) {
    return block;
  }

  const lineCount = content.split("\n").length;
  const summary = `[Compacted tool result: ${content.length} chars, ${lineCount} lines — content removed to save context]`;

  return {
    ...block,
    content: summary,
  };
}

/**
 * Compact old messages by summarizing tool results.
 * Keeps recent messages intact, compresses older ones.
 */
function compactMessages(
  messages: MessageParam[],
  keepRecent: number = 10
): CompactionResult {
  if (messages.length <= keepRecent) {
    return {
      messages: [...messages],
      removedCount: 0,
      estimatedTokensSaved: 0,
    };
  }

  const tokensBefore = estimateMessagesTokens(messages);
  const oldMessages = messages.slice(0, -keepRecent);
  const recentMessages = messages.slice(-keepRecent);

  const compacted: MessageParam[] = oldMessages.map((msg) => {
    if (typeof msg.content === "string" || !Array.isArray(msg.content)) {
      return msg;
    }

    const newContent = msg.content.map((block) => {
      const b = block as unknown as Record<string, unknown>;
      if (b.type === "tool_result") {
        return compactToolResult(block as Anthropic.ToolResultBlockParam);
      }
      return block;
    });

    return { ...msg, content: newContent };
  });

  const result = [...compacted, ...recentMessages];
  const tokensAfter = estimateMessagesTokens(result);

  return {
    messages: result,
    removedCount: 0,
    estimatedTokensSaved: tokensBefore - tokensAfter,
  };
}

/**
 * Drop oldest message pairs if compaction isn't enough.
 * Removes from the beginning, always keeping the first user message.
 */
function dropOldestMessages(
  messages: MessageParam[],
  targetTokens: number
): CompactionResult {
  const result = [...messages];
  let removed = 0;
  const tokensBefore = estimateMessagesTokens(result);

  // Always keep at least the most recent 4 messages
  while (result.length > 4 && estimateMessagesTokens(result) > targetTokens) {
    // Remove from index 0 (oldest), but keep pairs intact
    result.splice(0, 2); // Remove a user+assistant pair
    removed += 2;
  }

  const tokensAfter = estimateMessagesTokens(result);

  return {
    messages: result,
    removedCount: removed,
    estimatedTokensSaved: tokensBefore - tokensAfter,
  };
}

export class ContextManager {
  private budget: TokenBudget;

  constructor(budget: TokenBudget = DEFAULT_TOKEN_BUDGET) {
    this.budget = budget;
  }

  /**
   * Get the available token budget for messages.
   */
  getAvailableBudget(systemPromptTokens: number): number {
    return (
      this.budget.maxTokens -
      this.budget.reservedForResponse -
      systemPromptTokens
    );
  }

  /**
   * Check if messages exceed the available budget.
   */
  needsCompaction(
    messages: MessageParam[],
    systemPromptTokens: number
  ): boolean {
    const available = this.getAvailableBudget(systemPromptTokens);
    const used = estimateMessagesTokens(messages);
    return used > available * 0.8; // Trigger at 80% usage
  }

  /**
   * Apply compaction strategy to reduce token usage.
   * Strategy: first compact tool results, then drop old messages if needed.
   */
  compact(
    messages: MessageParam[],
    systemPromptTokens: number
  ): CompactionResult {
    const available = this.getAvailableBudget(systemPromptTokens);

    // Step 1: Compact tool results in old messages
    let result = compactMessages(messages);

    // Step 2: If still too large, drop oldest messages
    if (estimateMessagesTokens(result.messages) > available * 0.8) {
      const dropResult = dropOldestMessages(result.messages, Math.floor(available * 0.7));
      return {
        messages: dropResult.messages,
        removedCount: dropResult.removedCount,
        estimatedTokensSaved:
          result.estimatedTokensSaved + dropResult.estimatedTokensSaved,
      };
    }

    return result;
  }

  /**
   * Truncate file content for large files.
   */
  truncateFileContent(content: string, maxChars: number = 10000): string {
    return truncateToolResult(content, maxChars);
  }
}
