# Phase 6.2: Extension Points

## 概述

一个好的系统不仅功能完善，还要**容易扩展**。Phase 6.2 实现了四个扩展点，让用户和开发者可以在不修改核心代码的情况下增强 Agent 的能力：

1. **Hook 系统** — 在工具执行前后注入自定义逻辑
2. **Plugin 系统** — 从文件系统加载自定义工具
3. **Agent 定义** — 用 Markdown 定义自定义子代理
4. **MCP 服务器** — 通过标准协议暴露工具

## 1. Hook 系统

### 什么是 Hook？

Hook 是一种"钩子"机制，允许在特定事件发生时执行自定义代码。类似于 Git hooks 或 Webpack plugins。

### 四种 Hook 类型

| 类型 | 触发时机 | 用途 |
|------|---------|------|
| `pre_tool` | 工具执行前 | 参数验证、日志、权限检查 |
| `post_tool` | 工具执行后 | 结果过滤、审计、通知 |
| `pre_api` | API 调用前 | 请求修改、缓存检查 |
| `post_api` | API 调用后 | 响应处理、统计 |

### Hook 接口

```typescript
interface Hook {
  name: string;
  type: HookType;
  handler: (context: HookContext) => Promise<HookResult>;
  priority?: number;  // lower = earlier, default 100
}

interface HookResult {
  proceed: boolean;      // false = cancel the operation
  modifiedInput?: Record<string, unknown>;   // pre hooks
  modifiedResult?: string;                   // post hooks
}
```

### HookManager 实现

```typescript
class HookManager {
  private hooks: Hook[] = [];

  register(hook: Hook): void {
    // Insert sorted by priority
    const priority = hook.priority ?? 100;
    const index = this.hooks.findIndex(h => (h.priority ?? 100) > priority);
    if (index === -1) {
      this.hooks = [...this.hooks, { ...hook, priority }];
    } else {
      this.hooks = [
        ...this.hooks.slice(0, index),
        { ...hook, priority },
        ...this.hooks.slice(index),
      ];
    }
  }

  async run(type: HookType, context: HookContext): Promise<HookResult> {
    const matching = this.hooks.filter(h => h.type === type);
    let currentInput = context.input;
    let currentResult = context.result;

    for (const hook of matching) {
      const result = await hook.handler({ ...context, input: currentInput, result: currentResult });

      if (!result.proceed) return result;  // Chain stops

      if (result.modifiedInput) currentInput = result.modifiedInput;
      if (result.modifiedResult) currentResult = result.modifiedResult;
    }

    return { proceed: true };
  }
}
```

### 使用示例

```typescript
// Log all tool executions
hookManager.register({
  name: "audit-logger",
  type: "post_tool",
  priority: 10,
  handler: async (ctx) => {
    console.log(`Tool ${ctx.toolName} executed: ${ctx.isError ? "FAIL" : "OK"}`);
    return { proceed: true };
  },
});

// Block dangerous commands
hookManager.register({
  name: "safety-guard",
  type: "pre_tool",
  priority: 1,  // runs first
  handler: async (ctx) => {
    if (ctx.toolName === "run_command") {
      const cmd = (ctx.input?.command as string) ?? "";
      if (cmd.includes("rm -rf /")) {
        return { proceed: false };  // Block!
      }
    }
    return { proceed: true };
  },
});
```

### 关键设计决策

1. **优先级排序**：数字越小越先执行，确保安全检查在审计日志之前
2. **链式执行**：任何 hook 返回 `proceed: false` 都会中断链条
3. **输入修改传播**：pre hook 可以修改输入，下游 hook 看到的是修改后的版本

## 2. Plugin 系统

### 目录结构

```
.angel-agent/plugins/
├── my-plugin/
│   ├── manifest.json    // 插件清单
│   └── handler.js       // 工具处理器
└── another-plugin/
    ├── manifest.json
    └── search.js
```

### Manifest 格式

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "tools": [
    {
      "name": "my_custom_tool",
      "description": "Does something useful",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"]
      },
      "riskLevel": "read",
      "handler": "handler.js"
    }
  ]
}
```

### Handler 格式

```javascript
// handler.js — exports default async function
export default async function(input) {
  const { query } = input;
  // Do something with query...
  return `Result for: ${query}`;
}
```

### 加载流程

```typescript
async function loadPlugins(pluginDir: string): Promise<Tool[]> {
  // 1. Check if directory exists
  // 2. Scan for subdirectories
  // 3. Read and validate manifest.json (Zod schema)
  // 4. Create Tool objects with dynamic import handlers
  // 5. Skip invalid plugins with warning
}
```

### Zod 验证

```typescript
const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: z.record(z.unknown()),
    riskLevel: z.enum(["read", "write", "dangerous"]),
    handler: z.string(),
  })),
});
```

使用 Zod 验证确保无效的 manifest 不会导致运行时错误。

## 3. 自定义 Agent 定义

### Markdown 格式

```markdown
# Researcher Agent

## Description
Specializes in exploring codebases and finding relevant information.

## System Prompt
You are a research agent. Focus on reading and understanding code.
Do not modify any files. Report your findings clearly.

## Allowed Tools
- read_file
- list_directory

## Max Turns
15
```

### 解析器

```typescript
function parseAgentDefinition(content: string, filename: string): AgentDefinition {
  // Parse sections by H2 headings
  // H1 → name
  // ## Description → description
  // ## System Prompt → systemPrompt
  // ## Allowed Tools → parse bullet list
  // ## Max Turns → parse number (default 10)
}
```

### 存放位置

```
.angel-agent/agents/
├── researcher.md
├── coder.md
└── reviewer.md
```

### 与 delegate_task 的集成

当 Agent 使用 `delegate_task` 时，可以引用已定义的 agent 模板，自动应用 system prompt 和 tool 限制。

## 4. MCP 服务器

### 什么是 MCP？

MCP (Model Context Protocol) 是 Anthropic 提出的标准协议，用于 AI Agent 与外部工具之间的通信。使用 JSON-RPC 2.0 格式。

### 支持的方法

| 方法 | 功能 |
|------|------|
| `initialize` | 握手，交换能力信息 |
| `ping` | 健康检查 |
| `tools/list` | 列出可用工具 |
| `tools/call` | 执行工具 |

### 请求/响应格式

```json
// Request
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "read_file", "description": "...", "inputSchema": {...} }
    ]
  }
}
```

### 实现

```typescript
class MCPServer {
  private server: http.Server | null = null;
  private tools: Map<string, Tool> = new Map();

  async start(port: number): Promise<void> {
    const server = http.createServer((req, res) => {
      // Only accept POST
      // Parse JSON-RPC body
      // Route to handler method
    });
    server.listen(port);
  }

  registerTool(tool: Tool): void {
    this.tools = new Map([...this.tools, [tool.name, tool]]);
  }
}
```

### 使用方式

```bash
# Start agent with MCP server
npm run phase6 -- --mcp

# Test with curl
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 集成到 Agent Loop

### 初始化流程

```
1. detectProject() → project context
2. loadPlugins() → register custom tools
3. loadAgentDefinitions() → store definitions
4. Initialize HookManager
5. Start MCP server (if --mcp flag)
```

### 工具执行流程（增强后）

```
Tool Call → pre_tool hooks → permission check → executeWithFallback()
    → (timeout + retry) → post_tool hooks → return result
```

### 新增 REPL 命令

| 命令 | 功能 |
|------|------|
| `/plugins` | 列出加载的插件工具 |
| `/hooks` | 列出注册的 hooks |
| `/logs [n]` | 显示最近 n 条日志（默认 20） |
| `/turns` | 显示当前轮次 / 最大轮次 |
| `/agent-defs` | 列出自定义 agent 定义 |

## 架构总览

```
┌──────────────────────────────────────────────┐
│                 Agent Loop                     │
│                                                │
│  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │
│  │  Retry   │  │ Logger  │  │ Max Turns    │  │
│  │ withRetry│  │ create  │  │ checkLimit() │  │
│  └────┬─────┘  └─────────┘  └──────────────┘  │
│       │                                        │
│  ┌────▼──────────────────────────────────────┐│
│  │           API Call (streaming)             ││
│  └────┬──────────────────────────────────────┘│
│       │                                        │
│  ┌────▼──────────────────────────────────────┐│
│  │  pre_tool hooks → permission → fallback   ││
│  │  → post_tool hooks → return result        ││
│  └───────────────────────────────────────────┘│
│                                                │
│  ┌───────────┐  ┌──────────┐  ┌────────────┐ │
│  │  Plugins   │  │  Agent   │  │    MCP     │ │
│  │  loader    │  │  Defs    │  │  Server    │ │
│  └───────────┘  └──────────┘  └────────────┘ │
└──────────────────────────────────────────────┘
```

## 总结

Phase 6 通过四个维度让 Agent 变得可扩展：

| 扩展点 | 谁使用 | 如何使用 |
|--------|--------|---------|
| Hooks | 开发者 | 编程注册 pre/post 处理器 |
| Plugins | 用户 | 在 `.angel-agent/plugins/` 放置工具包 |
| Agent Defs | 用户 | 在 `.angel-agent/agents/` 写 Markdown |
| MCP Server | 外部系统 | 通过 HTTP + JSON-RPC 调用工具 |

至此，Angel Agent 的全部 6 个阶段已完成。从一个简单的 chat REPL 出发，我们构建了一个具备工具调用、权限管理、上下文优化、多步推理、子代理协作、内存持久化、错误恢复和扩展系统的完整 AI Agent。
