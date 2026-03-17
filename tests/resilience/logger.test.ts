import { describe, it, expect } from "vitest";
import { createLogger } from "../../src/resilience/logger.js";

describe("createLogger", () => {
  it("creates logger with correct module name", () => {
    const logger = createLogger("test-module");
    logger.info("hello");
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].module).toBe("test-module");
    expect(entries[0].message).toBe("hello");
    expect(entries[0].level).toBe("info");
  });

  it("filters debug messages when level is info", () => {
    const logger = createLogger("test");
    logger.debug("hidden");
    logger.info("visible");
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("visible");
  });

  it("shows debug messages when level is debug", () => {
    const logger = createLogger("test");
    logger.setLevel("debug");
    logger.debug("now visible");
    logger.info("also visible");
    expect(logger.getEntries()).toHaveLength(2);
  });

  it("returns all logged entries via getEntries", () => {
    const logger = createLogger("test");
    logger.info("one");
    logger.warn("two");
    logger.error("three");
    const entries = logger.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].level).toBe("info");
    expect(entries[1].level).toBe("warn");
    expect(entries[2].level).toBe("error");
  });

  it("limits buffer to 1000 entries", () => {
    const logger = createLogger("test");
    logger.setLevel("debug");
    for (let i = 0; i < 1050; i++) {
      logger.debug(`msg-${i}`);
    }
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1000);
    expect(entries[0].message).toBe("msg-50");
    expect(entries[999].message).toBe("msg-1049");
  });

  it("setLevel changes filtering behavior", () => {
    const logger = createLogger("test");
    logger.setLevel("error");
    logger.info("hidden");
    logger.warn("hidden");
    logger.error("visible");
    expect(logger.getEntries()).toHaveLength(1);
    expect(logger.getEntries()[0].level).toBe("error");
  });

  it("includes data when provided", () => {
    const logger = createLogger("test");
    logger.info("with data", { key: "value" });
    expect(logger.getEntries()[0].data).toEqual({ key: "value" });
  });

  it("includes timestamp", () => {
    const before = Date.now();
    const logger = createLogger("test");
    logger.info("timed");
    const after = Date.now();
    const ts = logger.getEntries()[0].timestamp;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
