export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  readonly module: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly timestamp: number;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
  getEntries(): readonly LogEntry[];
}

export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly retryableStatuses: readonly number[];
}

export interface FallbackResult {
  readonly result: string;
  readonly isError: boolean;
  readonly fallbackUsed: boolean;
  readonly originalError?: string;
}
