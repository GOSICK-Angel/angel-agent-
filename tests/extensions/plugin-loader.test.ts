import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { validateManifest, loadPlugins } from "../../src/extensions/plugin-loader.js";

describe("validateManifest", () => {
  it("should validate a correct manifest", () => {
    const raw = {
      name: "test-plugin",
      version: "1.0.0",
      tools: [
        {
          name: "test_tool",
          description: "A test tool",
          inputSchema: { type: "object", properties: {} },
          riskLevel: "read",
          handler: "handler.js",
        },
      ],
    };

    const result = validateManifest(raw);
    expect(result.name).toBe("test-plugin");
    expect(result.version).toBe("1.0.0");
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("test_tool");
  });

  it("should reject invalid manifest", () => {
    expect(() => validateManifest({})).toThrow();
    expect(() => validateManifest({ name: "x" })).toThrow();
    expect(() =>
      validateManifest({
        name: "x",
        version: "1.0",
        tools: [{ name: "t" }],
      })
    ).toThrow();
  });
});

describe("loadPlugins", () => {
  it("should return empty array for nonexistent dir", async () => {
    const result = await loadPlugins("/nonexistent/path/plugins");
    expect(result).toEqual([]);
  });

  it("should load a valid plugin from temp dir", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-test-"));
    const pluginDir = path.join(tmpDir, "my-plugin");
    await fs.mkdir(pluginDir, { recursive: true });

    const manifest = {
      name: "my-plugin",
      version: "1.0.0",
      tools: [
        {
          name: "greet",
          description: "Greets user",
          inputSchema: { type: "object", properties: {} },
          riskLevel: "read",
          handler: "handler.mjs",
        },
      ],
    };

    await fs.writeFile(
      path.join(pluginDir, "manifest.json"),
      JSON.stringify(manifest)
    );

    await fs.writeFile(
      path.join(pluginDir, "handler.mjs"),
      'export default async function(input) { return "hello"; }'
    );

    const tools = await loadPlugins(tmpDir);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("greet");
    expect(tools[0].riskLevel).toBe("read");

    const result = await tools[0].execute({});
    expect(result).toBe("hello");

    await fs.rm(tmpDir, { recursive: true });
  });
});
