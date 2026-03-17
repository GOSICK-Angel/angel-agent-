# Phase 5.1: Sub-Agent System

## Overview

Sub-agent 系统让主 agent 能够将复杂任务拆分为独立的子任务，交给隔离的 sub-agent 执行。这是 Claude Code 等生产级 agent 的核心架构模式。

## 核心概念

### 为什么需要 Sub-Agent？

1. **任务隔离** — 每个 sub-agent 有自己的 `messages[]` 数组，不会污染主 agent 的上下文
2. **工具限制** — 可以限制 sub-agent 只使用特定工具（如只读工具）
3. **并行执行** — 多个独立任务可以同时运行
4. **失败隔离** — sub-agent 失败不会影响主 agent

### In-Process vs Child Process

我们选择 **in-process** 模式（在同一个 Node.js 进程内运行），而不是 child process：

| 特性 | In-Process | Child Process |
|------|-----------|---------------|
| 复杂度 | 低 | 高 |
| 共享权限 | 直接继承 | 需要 IPC |
| 调试 | 简单 | 复杂 |
| 资源隔离 | 无 | 完全 |
| 适合学习 | ✓ | ✗ |

## 架构设计

```
Main Agent
    │
    ├── AgentCoordinator (管理所有 sub-agent)
    │       │
    │       ├── SubAgent A (研究任务)
    │       │     ├── 自己的 messages[]
    │       │     ├── 自己的 LoopGuard
    │       │     └── 受限的工具集
    │       │
    │       └── SubAgent B (编码任务)
    │             ├── 自己的 messages[]
    │             ├── 自己的 LoopGuard
    │             └── 完整工具集
    │
    └── delegate_task 工具 (触发 sub-agent)
```

## 代码详解

### 1. 类型定义 (`src/agents/types.ts`)

```typescript
// Agent 生命周期状态
type AgentStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

// Sub-agent 配置
interface SubAgentConfig {
  readonly name: string;           // 简短名称
  readonly task: string;           // 任务描述
  readonly allowedTools?: readonly string[];  // 允许的工具
  readonly maxTurns?: number;      // 最大轮次
}

// Sub-agent 实例（不可变）
interface SubAgent {
  readonly id: string;
  readonly config: SubAgentConfig;
  readonly status: AgentStatus;
  readonly messages: readonly MessageParam[];
  readonly result: string | null;
  readonly error: string | null;
  readonly toolCallCount: number;
}
```

关键设计：所有字段都是 `readonly`，状态变化通过创建新对象实现。

### 2. Sub-Agent 创建与运行 (`src/agents/sub-agent.ts`)

```typescript
// 创建（纯函数，返回新对象）
function createSubAgent(config: SubAgentConfig): SubAgent {
  return {
    id: crypto.randomUUID(),
    config,
    status: "idle",
    messages: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    completedAt: null,
    toolCallCount: 0,
  };
}

// 运行（非流式，简化版 agent loop）
async function runSubAgent(
  agent: SubAgent,
  client: Anthropic,
  registry: ToolRegistry,
  permissionManager: PermissionManager,
  systemPrompt: string
): Promise<SubAgent>
```

**Sub-agent loop vs Main agent loop:**

| 特性 | Main Loop | Sub-Agent Loop |
|------|-----------|----------------|
| 流式输出 | ✓ | ✗ |
| Plan 追踪 | ✓ | ✗ |
| 上下文压缩 | ✓ | ✗ |
| 工具过滤 | ✗ | ✓ |
| Loop Guard | 共享 | 独立实例 |
| 权限管理 | 自有 | 继承 |

### 3. 并行执行 (`src/agents/parallel.ts`)

```typescript
async function executeToolsInParallel(
  toolUses: readonly ToolUseRequest[],
  registry: ToolRegistry,
  permissionManager: PermissionManager
): Promise<ParallelToolResult[]>
```

安全策略：
- **Read-only 工具** → `Promise.all` 并行执行
- **Write/Dangerous 工具** → 顺序执行
- 结果按原始顺序返回

```
输入: [read_file A, read_file B, write_file C, read_file D]
执行:
  并行: Promise.all([read A, read B, read D])
  顺序: await write C
返回: [result A, result B, result C, result D]  // 保持原顺序
```

### 4. 协调器 (`src/agents/coordinator.ts`)

```typescript
class AgentCoordinator {
  spawn(config): SpawnResult           // 创建 sub-agent
  runAgent(id, client, ...): SubAgent  // 运行 sub-agent
  sendMessage(from, to, content)       // agent 间消息传递
  getMessages(agentId)                 // 获取消息记录
  getAllAgents()                        // 列出所有 agent
  getAgentsByStatus(status)            // 按状态筛选
}
```

## 实际使用

在 Phase 5 agent loop 中，`delegate_task` 作为一个工具暴露给 LLM：

```
User: "帮我分析 src/ 下所有 TypeScript 文件的代码质量"

LLM 决定使用 delegate_task:
  → name: "code-analyzer"
  → task: "List and analyze all .ts files in src/"
  → allowed_tools: ["read_file", "list_directory"]

Coordinator.spawn() → 创建 sub-agent
Coordinator.runAgent() → 运行隔离的 agent loop
  → sub-agent 使用 read_file 和 list_directory 完成分析
  → 返回结果给主 agent

主 agent 整合 sub-agent 的结果给用户
```

## 关键学习点

1. **不可变状态** — SubAgent 的每次状态变化都创建新对象
2. **工具过滤** — `ToolRegistry.filter()` 创建新的 registry 实例
3. **权限继承** — sub-agent 复用 parent 的 PermissionManager
4. **Loop Guard 隔离** — 每个 sub-agent 有独立的循环检测
5. **错误隔离** — sub-agent 的异常被捕获，不会崩溃主 agent
