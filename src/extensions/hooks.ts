import type { Hook, HookType, HookContext, HookResult } from "./types.js";

const DEFAULT_PRIORITY = 100;

export class HookManager {
  private hooks: Hook[] = [];

  register(hook: Hook): void {
    const priority = hook.priority ?? DEFAULT_PRIORITY;
    const hookWithPriority = { ...hook, priority };
    const index = this.hooks.findIndex(
      (h) => (h.priority ?? DEFAULT_PRIORITY) > priority
    );
    if (index === -1) {
      this.hooks = [...this.hooks, hookWithPriority];
    } else {
      this.hooks = [
        ...this.hooks.slice(0, index),
        hookWithPriority,
        ...this.hooks.slice(index),
      ];
    }
  }

  remove(name: string): void {
    this.hooks = this.hooks.filter((h) => h.name !== name);
  }

  list(): readonly Hook[] {
    return [...this.hooks];
  }

  async run(type: HookType, context: HookContext): Promise<HookResult> {
    const matching = this.hooks.filter((h) => h.type === type);

    let currentInput = context.input;
    let currentResult = context.result;

    for (const hook of matching) {
      const ctx: HookContext = {
        ...context,
        input: currentInput,
        result: currentResult,
      };

      const result = await hook.handler(ctx);

      if (!result.proceed) {
        return result;
      }

      if (result.modifiedInput !== undefined) {
        currentInput = result.modifiedInput;
      }
      if (result.modifiedResult !== undefined) {
        currentResult = result.modifiedResult;
      }
    }

    return {
      proceed: true,
      ...(currentInput !== context.input
        ? { modifiedInput: currentInput }
        : {}),
      ...(currentResult !== context.result
        ? { modifiedResult: currentResult }
        : {}),
    };
  }
}
