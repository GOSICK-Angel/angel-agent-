import { describe, it, expect } from "vitest";
import { HookManager } from "../../src/extensions/hooks.js";
import type { Hook, HookContext, HookResult } from "../../src/extensions/types.js";

function createHook(
  name: string,
  type: Hook["type"] = "pre_tool",
  priority?: number,
  handler?: (ctx: HookContext) => Promise<HookResult>
): Hook {
  return {
    name,
    type,
    priority,
    handler: handler ?? (async () => ({ proceed: true })),
  };
}

describe("HookManager", () => {
  describe("register and list", () => {
    it("should register and list hooks", () => {
      const manager = new HookManager();
      manager.register(createHook("a"));
      manager.register(createHook("b"));

      const hooks = manager.list();
      expect(hooks).toHaveLength(2);
      expect(hooks[0].name).toBe("a");
      expect(hooks[1].name).toBe("b");
    });

    it("should sort by priority (lower first)", () => {
      const manager = new HookManager();
      manager.register(createHook("high", "pre_tool", 200));
      manager.register(createHook("low", "pre_tool", 10));
      manager.register(createHook("mid", "pre_tool", 50));

      const hooks = manager.list();
      expect(hooks.map((h) => h.name)).toEqual(["low", "mid", "high"]);
    });

    it("should use default priority 100", () => {
      const manager = new HookManager();
      manager.register(createHook("default"));
      manager.register(createHook("before", "pre_tool", 50));

      const hooks = manager.list();
      expect(hooks[0].name).toBe("before");
      expect(hooks[1].name).toBe("default");
    });
  });

  describe("remove", () => {
    it("should remove hook by name", () => {
      const manager = new HookManager();
      manager.register(createHook("a"));
      manager.register(createHook("b"));
      manager.remove("a");

      const hooks = manager.list();
      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe("b");
    });
  });

  describe("run", () => {
    it("should execute hooks in priority order", async () => {
      const manager = new HookManager();
      const order: string[] = [];

      manager.register(
        createHook("second", "pre_tool", 20, async () => {
          order.push("second");
          return { proceed: true };
        })
      );
      manager.register(
        createHook("first", "pre_tool", 10, async () => {
          order.push("first");
          return { proceed: true };
        })
      );

      await manager.run("pre_tool", {});
      expect(order).toEqual(["first", "second"]);
    });

    it("should stop chain when proceed is false", async () => {
      const manager = new HookManager();
      const order: string[] = [];

      manager.register(
        createHook("blocker", "pre_tool", 10, async () => {
          order.push("blocker");
          return { proceed: false };
        })
      );
      manager.register(
        createHook("after", "pre_tool", 20, async () => {
          order.push("after");
          return { proceed: true };
        })
      );

      const result = await manager.run("pre_tool", {});
      expect(result.proceed).toBe(false);
      expect(order).toEqual(["blocker"]);
    });

    it("should propagate modifiedInput", async () => {
      const manager = new HookManager();

      manager.register(
        createHook("modifier", "pre_tool", 10, async () => ({
          proceed: true,
          modifiedInput: { key: "modified" },
        }))
      );
      manager.register(
        createHook("reader", "pre_tool", 20, async (ctx) => {
          expect(ctx.input).toEqual({ key: "modified" });
          return { proceed: true };
        })
      );

      const result = await manager.run("pre_tool", { input: { key: "original" } });
      expect(result.proceed).toBe(true);
      expect(result.modifiedInput).toEqual({ key: "modified" });
    });

    it("should only run hooks matching the type", async () => {
      const manager = new HookManager();
      const called: string[] = [];

      manager.register(
        createHook("pre", "pre_tool", undefined, async () => {
          called.push("pre");
          return { proceed: true };
        })
      );
      manager.register(
        createHook("post", "post_tool", undefined, async () => {
          called.push("post");
          return { proceed: true };
        })
      );

      await manager.run("pre_tool", {});
      expect(called).toEqual(["pre"]);
    });

    it("should return default result when no hooks match", async () => {
      const manager = new HookManager();
      const result = await manager.run("pre_tool", {});
      expect(result.proceed).toBe(true);
    });
  });
});
