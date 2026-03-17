# Phase 2.1 — Tool Registry：从硬编码到可插拔

## 你将学到

1. 为什么 switch/case 硬编码工具会成为瓶颈
2. 注册表模式（Registry Pattern）的设计思路
3. 用 Zod 做运行时输入验证
4. 如何把现有工具迁移到新架构

---

## 1. Phase 1 的问题

回顾 Phase 1.2 的 `agent-loop-with-tools.ts`，工具定义和执行被硬编码在同一个文件里：

```typescript
// 工具定义 — 一个大数组
const tools: Anthropic.Tool[] = [
  { name: "read_file", description: "...", input_schema: { ... } },
  { name: "list_directory", description: "...", input_schema: { ... } },
];

// 工具执行 — 一个大 switch
function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "read_file": { ... }
    case "list_directory": { ... }
    default: return `Error: Unknown tool: ${name}`;
  }
}
```

**问题：**
- 添加新工具需要修改**两个地方**（tools 数组 + switch）
- 所有工具代码挤在一个文件里，越来越臃肿
- 无法给工具附加元数据（比如风险级别）
- 没有输入验证 — `input.path as string` 是不安全的类型断言

---

## 2. 解决方案：注册表模式

**注册表模式**的核心思想：每个工具是一个独立的对象，注册到一个中央管理器。

```
                    ToolRegistry
                   ┌─────────────┐
  read_file.ts ──► │  Map<Tool>  │ ──► toApiFormat() ──► Claude API
  write_file.ts ──►│             │
  edit_file.ts ──► │  register() │ ──► get("read_file") ──► execute
  run_command.ts ──►│  get()     │
                   └─────────────┘
```

### Tool 接口

```typescript
import { z } from "zod";

type RiskLevel = "read" | "write" | "dangerous";

interface Tool {
  name: string;            // Claude 用来调用的名字
  description: string;     // Claude 用来决定何时调用
  inputSchema: z.ZodSchema; // Zod schema — 运行时验证
  apiSchema: object;        // JSON Schema — 发给 Claude API
  riskLevel: RiskLevel;     // 权限系统用来分类
  execute(input: unknown): Promise<string>;  // 实际执行
}
```

注意有**两个 schema**：
- `inputSchema`（Zod）：用于运行时验证，在 `execute` 内部调用 `schema.parse(input)`
- `apiSchema`（JSON Schema）：发给 Claude API，告诉 Claude 参数格式

为什么不从 Zod 自动生成 JSON Schema？可以用 `zod-to-json-schema` 库，但手写更可控。Phase 2 先用手写，后续可以优化。

### ToolRegistry 类

```typescript
class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  toApiFormat(): Anthropic.Tool[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.apiSchema,
    }));
  }
}
```

核心很简单 — 就是一个 `Map` 加几个便捷方法。`toApiFormat()` 把内部的 Tool 转成 Claude API 需要的格式。

---

## 3. Zod — 运行时输入验证

TypeScript 的类型只在编译时检查。从 Claude API 收到的 `input` 是 `unknown` 类型 — 你不知道它到底是什么。

**不安全的做法（Phase 1）：**
```typescript
const filePath = input.path as string;  // 如果 path 不存在呢？如果不是 string 呢？
```

**安全的做法（Phase 2）：**
```typescript
import { z } from "zod";

const inputSchema = z.object({
  path: z.string(),
});

async execute(rawInput: unknown): Promise<string> {
  const input = inputSchema.parse(rawInput);  // 验证 + 类型推断
  // input.path 现在保证是 string
}
```

`z.object().parse()` 做两件事：
1. **运行时验证**：如果输入不符合 schema，抛出 `ZodError`
2. **类型推断**：TypeScript 自动知道 `input.path` 是 `string`

---

## 4. 迁移现有工具

以 `read_file` 为例，从 agent-loop 里的硬编码提取成独立文件：

**之前（agent-loop-with-tools.ts 里的代码）：**
```typescript
case "read_file": {
  const filePath = input.path as string;  // 不安全
  const content = fs.readFileSync(path.resolve(filePath), "utf-8");
  return content;
}
```

**之后（src/tools/read-file.ts）：**
```typescript
import { z } from "zod";
import type { Tool } from "./types.js";

const inputSchema = z.object({
  path: z.string(),
});

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file...",
  inputSchema,
  apiSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  riskLevel: "read",

  async execute(rawInput: unknown): Promise<string> {
    const input = inputSchema.parse(rawInput);
    // ... 同样的逻辑，但有了类型安全
  },
};
```

改动点：
1. 独立文件，导出一个 `Tool` 对象
2. 加了 `riskLevel: "read"` — 权限系统会用
3. 用 Zod 验证输入
4. `execute` 变成了 `async` — 为后续异步工具做准备

---

## 5. 重构后的 Agent Loop

对比 Phase 1 和 Phase 2 的 agent loop 核心变化：

**Phase 1：**
```typescript
const tools: Anthropic.Tool[] = [ /* 硬编码 */ ];

function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) { /* 硬编码 */ }
}
```

**Phase 2：**
```typescript
const registry = new ToolRegistry();
registry.register(readFileTool);
registry.register(listDirectoryTool);
registry.register(writeFileTool);
registry.register(editFileTool);
registry.register(runCommandTool);

// 传给 Claude API
tools: registry.toApiFormat()

// 执行工具
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const tool = registry.get(name);
  if (!tool) return `Error: Unknown tool: ${name}`;
  return tool.execute(input);
}
```

添加新工具只需：
1. 创建 `src/tools/my-new-tool.ts`
2. 在 agent loop 里 `registry.register(myNewTool)`

不需要修改 switch，不需要修改 tools 数组，不需要修改 executeTool 函数。

---

## 6. 核心要点

1. **注册表模式 = 可插拔** — 新工具只需 register，不用改核心逻辑
2. **每个工具一个文件** — 高内聚低耦合，便于测试
3. **Zod 做运行时验证** — 永远不要相信外部输入
4. **两个 schema** — Zod 给你的代码用，JSON Schema 给 Claude API 用
5. **RiskLevel 元数据** — 为权限系统做准备

---

## 7. 动手练习

1. 阅读 `src/tools/registry.ts`，理解 `Map` 的使用
2. 阅读任意一个工具文件，找到 Zod schema 和 API schema 的对应关系
3. 运行 `npx vitest run tests/tools/registry.test.ts` — 看注册表的测试
4. 思考：如果要添加一个 `search_files` 工具（在文件中搜索关键词），你需要做什么？

---

下一节：[02-new-tools.md](./02-new-tools.md) — 三个让 Agent 真正有用的新工具
