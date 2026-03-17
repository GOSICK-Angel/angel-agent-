import { describe, it, expect } from "vitest";
import { needsConfirmation, alwaysConfirm } from "../../src/permissions/classifier.js";

describe("Permission classifier", () => {
  describe("needsConfirmation", () => {
    it("returns false for read", () => {
      expect(needsConfirmation("read")).toBe(false);
    });

    it("returns true for write", () => {
      expect(needsConfirmation("write")).toBe(true);
    });

    it("returns true for dangerous", () => {
      expect(needsConfirmation("dangerous")).toBe(true);
    });
  });

  describe("alwaysConfirm", () => {
    it("returns false for read", () => {
      expect(alwaysConfirm("read")).toBe(false);
    });

    it("returns false for write", () => {
      expect(alwaysConfirm("write")).toBe(false);
    });

    it("returns true for dangerous", () => {
      expect(alwaysConfirm("dangerous")).toBe(true);
    });
  });
});
