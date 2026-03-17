import type { Tool } from "../tools/types.js";
import type { FallbackResult } from "./types.js";
import { createLogger } from "./logger.js";

let failureCounts: Map<string, number> = new Map();

const logger = createLogger("tool-fallback");

export function getFailureCounts(): Map<string, number> {
  return new Map(failureCounts);
}

export function resetFailureCounts(): void {
  failureCounts = new Map();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function recordFailure(toolName: string): void {
  const current = failureCounts.get(toolName) ?? 0;
  failureCounts = new Map([...failureCounts, [toolName, current + 1]]);
}

export async function executeWithFallback(
  tool: Tool,
  input: Record<string, unknown>,
  options?: { timeout?: number; retries?: number }
): Promise<FallbackResult> {
  const timeout = options?.timeout ?? 30000;
  const retries = options?.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(tool.execute(input), timeout);
      return {
        result,
        isError: false,
        fallbackUsed: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.startsWith("Timeout after")) {
        recordFailure(tool.name);
        const seconds = timeout / 1000;
        logger.warn(`Tool ${tool.name} timed out after ${seconds}s`);
        return {
          result: `Tool timed out after ${seconds}s`,
          isError: true,
          fallbackUsed: true,
          originalError: errorMessage,
        };
      }

      if (attempt < retries) {
        logger.warn(
          `Tool ${tool.name} failed, retrying (${attempt + 1}/${retries})`,
          { error: errorMessage }
        );
        continue;
      }

      recordFailure(tool.name);
      logger.error(`Tool ${tool.name} failed after ${retries + 1} attempts`, {
        error: errorMessage,
      });
      return {
        result: errorMessage,
        isError: true,
        fallbackUsed: true,
        originalError: errorMessage,
      };
    }
  }

  return {
    result: "Unexpected execution path",
    isError: true,
    fallbackUsed: true,
  };
}
