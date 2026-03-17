import type { RetryConfig } from "./types.js";
import { createLogger } from "./logger.js";

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 60000,
  retryableStatuses: [429, 500, 502, 503, 529],
};

export function calculateBackoff(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

interface ApiError extends Error {
  status?: number;
  headers?: Record<string, string>;
}

function isRetryable(error: unknown, config: RetryConfig): boolean {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as ApiError).status;
    if (typeof status === "number") {
      return config.retryableStatuses.includes(status);
    }
  }
  return true;
}

function getRetryAfter(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "headers" in error) {
    const headers = (error as ApiError).headers;
    const retryAfter = headers?.["retry-after"];
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
    }
  }
  return null;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const merged: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const logger = createLogger("retry");
  let lastError: unknown;

  for (let attempt = 0; attempt <= merged.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === merged.maxRetries) {
        break;
      }

      if (!isRetryable(error, merged)) {
        throw error;
      }

      const retryAfterDelay = getRetryAfter(error);
      const delay = retryAfterDelay ?? calculateBackoff(attempt, merged);

      logger.warn(`Retry attempt ${attempt + 1}/${merged.maxRetries}`, {
        delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
