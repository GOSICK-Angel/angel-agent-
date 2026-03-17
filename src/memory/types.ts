import type { MessageParam } from "../core/types.js";

export interface SessionData {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly projectPath: string;
  readonly messages: readonly MessageParam[];
  readonly metadata: {
    readonly model: string;
    readonly totalTokensUsed: number;
    readonly toolCallCount: number;
  };
}

export interface ProjectFact {
  readonly key: string;
  readonly value: string;
  readonly createdAt: number;
  readonly source: "user" | "agent" | "config";
}

export interface ProjectMemoryData {
  readonly projectPath: string;
  readonly facts: readonly ProjectFact[];
  readonly updatedAt: number;
}

export interface CacheEntry<T> {
  readonly value: T;
  readonly createdAt: number;
  readonly ttl: number;
}

export interface CacheConfig {
  readonly maxSize: number;
  readonly defaultTtl: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 100,
  defaultTtl: 300_000,
};
