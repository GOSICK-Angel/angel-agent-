import type { CacheConfig, CacheEntry } from "./types.js";
import { DEFAULT_CACHE_CONFIG } from "./types.js";

export class LRUCache<T> {
  private readonly entries: Map<string, CacheEntry<T>>;
  private readonly config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.entries = new Map();
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    this.entries.delete(key);

    if (this.entries.size >= this.config.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      ttl: ttl ?? this.config.defaultTtl,
    };
    this.entries.set(key, entry);
  }

  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.createdAt > entry.ttl;
  }
}
