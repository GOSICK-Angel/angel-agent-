import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LRUCache } from "../../src/memory/cache.js";

describe("LRUCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should set and get a value", () => {
    const cache = new LRUCache<string>();
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("should return undefined for missing key", () => {
    const cache = new LRUCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("should overwrite existing key", () => {
    const cache = new LRUCache<string>();
    cache.set("key1", "value1");
    cache.set("key1", "value2");
    expect(cache.get("key1")).toBe("value2");
    expect(cache.size).toBe(1);
  });

  it("should evict oldest entry when at capacity", () => {
    const cache = new LRUCache<string>({ maxSize: 2 });
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.size).toBe(2);
  });

  it("should promote accessed entry on get", () => {
    const cache = new LRUCache<string>({ maxSize: 2 });
    cache.set("a", "1");
    cache.set("b", "2");
    cache.get("a");
    cache.set("c", "3");

    expect(cache.get("a")).toBe("1");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("3");
  });

  it("should expire entries based on TTL", () => {
    const cache = new LRUCache<string>({ defaultTtl: 1000 });
    cache.set("key1", "value1");

    vi.advanceTimersByTime(1001);
    expect(cache.get("key1")).toBeUndefined();
  });

  it("should not expire entries before TTL", () => {
    const cache = new LRUCache<string>({ defaultTtl: 1000 });
    cache.set("key1", "value1");

    vi.advanceTimersByTime(999);
    expect(cache.get("key1")).toBe("value1");
  });

  it("should support custom TTL per entry", () => {
    const cache = new LRUCache<string>({ defaultTtl: 5000 });
    cache.set("short", "val", 100);
    cache.set("long", "val", 10000);

    vi.advanceTimersByTime(101);
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("val");
  });

  it("should report correct size", () => {
    const cache = new LRUCache<string>();
    expect(cache.size).toBe(0);
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size).toBe(2);
  });

  it("should check existence with has()", () => {
    const cache = new LRUCache<string>();
    cache.set("key1", "value1");
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("missing")).toBe(false);
  });

  it("should return false for expired entry in has()", () => {
    const cache = new LRUCache<string>({ defaultTtl: 100 });
    cache.set("key1", "value1");
    vi.advanceTimersByTime(101);
    expect(cache.has("key1")).toBe(false);
  });

  it("should delete entries", () => {
    const cache = new LRUCache<string>();
    cache.set("key1", "value1");
    expect(cache.delete("key1")).toBe(true);
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.delete("missing")).toBe(false);
  });

  it("should clear all entries", () => {
    const cache = new LRUCache<string>();
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});
