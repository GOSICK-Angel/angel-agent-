import type { LoopGuardConfig, LoopGuardResult } from "./types.js";
import { DEFAULT_LOOP_GUARD_CONFIG } from "./types.js";

interface ToolCall {
  readonly name: string;
  readonly input: string;
}

export class LoopGuard {
  private readonly config: LoopGuardConfig;
  private consecutiveErrors: number = 0;
  private totalCalls: number = 0;
  private callHistory: ToolCall[] = [];

  constructor(config: LoopGuardConfig = DEFAULT_LOOP_GUARD_CONFIG) {
    this.config = config;
  }

  recordCall(name: string, input: Record<string, unknown>): LoopGuardResult {
    this.totalCalls++;
    const serialized = JSON.stringify(input);
    this.callHistory = [...this.callHistory, { name, input: serialized }];

    if (this.totalCalls >= this.config.maxTotalCalls) {
      return {
        stop: true,
        reason: `Reached maximum tool calls (${this.config.maxTotalCalls}). Stopping to prevent infinite loop.`,
      };
    }

    const repetitions = this.callHistory.filter(
      (c) => c.name === name && c.input === serialized
    ).length;

    if (repetitions >= this.config.maxRepetitions) {
      return {
        stop: true,
        reason: `Tool "${name}" called ${repetitions} times with identical input. Agent appears stuck.`,
      };
    }

    return { stop: false, reason: "" };
  }

  recordError(): LoopGuardResult {
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      return {
        stop: false,
        reason: `${this.consecutiveErrors} consecutive errors. Try a different approach or ask the user for help.`,
      };
    }

    return { stop: false, reason: "" };
  }

  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  reset(): void {
    this.consecutiveErrors = 0;
    this.totalCalls = 0;
    this.callHistory = [];
  }

  getStats(): {
    totalCalls: number;
    consecutiveErrors: number;
    uniqueCalls: number;
  } {
    const unique = new Set(
      this.callHistory.map((c) => `${c.name}:${c.input}`)
    );
    return {
      totalCalls: this.totalCalls,
      consecutiveErrors: this.consecutiveErrors,
      uniqueCalls: unique.size,
    };
  }
}
