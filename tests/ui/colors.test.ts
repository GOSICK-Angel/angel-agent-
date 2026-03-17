import { describe, it, expect } from "vitest";
import {
  toolLabel,
  tokenInfo,
  errorText,
  successText,
  warningText,
} from "../../src/ui/colors.js";

describe("colors", () => {
  it("toolLabel should wrap name in brackets", () => {
    const label = toolLabel("read_file");
    expect(label).toContain("read_file");
    expect(label).toContain("[");
    expect(label).toContain("]");
  });

  it("tokenInfo should include token counts", () => {
    const info = tokenInfo(1000, 500);
    expect(info).toContain("1000");
    expect(info).toContain("500");
  });

  it("errorText should include the message", () => {
    const text = errorText("something failed");
    expect(text).toContain("something failed");
    expect(text).toContain("✗");
  });

  it("successText should include the message", () => {
    const text = successText("done");
    expect(text).toContain("done");
    expect(text).toContain("✓");
  });

  it("warningText should include the message", () => {
    const text = warningText("careful");
    expect(text).toContain("careful");
    expect(text).toContain("⚠");
  });
});
