import { describe, it, expect, vi } from "vitest";
import {
  calculateBackoff,
  DEFAULT_RETRY_CONFIG,
  withRetry,
} from "../../src/resilience/retry.js";

describe("calculateBackoff", () => {
  it("returns values within expected range", () => {
    const result = calculateBackoff(0, DEFAULT_RETRY_CONFIG);
    expect(result).toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.baseDelay);
    expect(result).toBeLessThanOrEqual(
      DEFAULT_RETRY_CONFIG.baseDelay + 500
    );
  });

  it("increases with attempt number", () => {
    const results = Array.from({ length: 5 }, (_, i) =>
      calculateBackoff(i, { ...DEFAULT_RETRY_CONFIG, maxDelay: Infinity })
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(DEFAULT_RETRY_CONFIG.baseDelay * Math.pow(2, i) - 1);
    }
  });

  it("is capped at maxDelay", () => {
    const config = { ...DEFAULT_RETRY_CONFIG, maxDelay: 5000 };
    const result = calculateBackoff(20, config);
    expect(result).toBeLessThanOrEqual(5000);
  });
});

describe("withRetry", () => {
  it("succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and eventually succeeds", async () => {
    const error429 = Object.assign(new Error("rate limited"), {
      status: 429,
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValue("success");

    const result = await withRetry(fn, { baseDelay: 10, maxDelay: 50 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on 401", async () => {
    const error401 = Object.assign(new Error("unauthorized"), {
      status: 401,
    });
    const fn = vi.fn().mockRejectedValue(error401);

    await expect(
      withRetry(fn, { baseDelay: 10 })
    ).rejects.toThrow("unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on 400", async () => {
    const error400 = Object.assign(new Error("bad request"), {
      status: 400,
    });
    const fn = vi.fn().mockRejectedValue(error400);

    await expect(
      withRetry(fn, { baseDelay: 10 })
    ).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exhausted", async () => {
    const error500 = Object.assign(new Error("server error"), {
      status: 500,
    });
    const fn = vi.fn().mockRejectedValue(error500);

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 50 })
    ).rejects.toThrow("server error");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses retry-after header for 429", async () => {
    const error429 = Object.assign(new Error("rate limited"), {
      status: 429,
      headers: { "retry-after": "1" },
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error429)
      .mockResolvedValue("ok");

    const start = Date.now();
    await withRetry(fn, { baseDelay: 10, maxDelay: 50 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});
