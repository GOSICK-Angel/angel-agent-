# Phase 5.2: Memory & Persistence

## Overview

Memory 系统为 agent 提供三种持久化能力：

1. **Session Persistence** — 保存/恢复对话历史
2. **Project Memory** — 跨 session 的键值事实存储
3. **Config Reader** — 读取项目级 agent 配置文件
4. **LRU Cache** — 缓存频繁读取的文件和命令结果

## 为什么需要持久化？

没有持久化的 agent 每次启动都是"失忆"的：
- 不记得上次做了什么
- 不知道项目的关键信息
- 重复读取相同的文件

有了持久化：
- `/save` 保存当前对话，下次用 `/resume` 恢复
- Project Memory 记住 "这个项目用 Vitest" 等事实
- Cache 避免重复读取大文件

## 存储设计

```
project-root/
├── .angel-agent/
│   ├── sessions/
│   │   ├── a1b2c3d4-....json    # 对话 session
│   │   └── e5f6g7h8-....json
│   └── memory.json               # 项目记忆
└── .angel-agent.md                # 配置文件
```

选择 JSON 文件而不是 SQLite 的原因：
- **可检查** — 直接用编辑器查看
- **可调试** — 出问题时容易定位
- **无依赖** — 不需要额外的 npm 包
- **适合学习** — 理解数据结构

## 代码详解

### 1. LRU Cache (`src/memory/cache.ts`)

LRU (Least Recently Used) 缓存：当容量满时，淘汰最久未访问的条目。

```typescript
class LRUCache<T> {
  // 利用 Map 的插入顺序特性实现 LRU
  private entries: Map<string, CacheEntry<T>>;

  get(key) {
    // 1. 查找条目
    // 2. 检查 TTL 过期
    // 3. 删除再插入（移到末尾 = 最近使用）
    // 4. 返回值
  }

  set(key, value, ttl?) {
    // 1. 如果 key 已存在，先删除
    // 2. 如果达到容量，删除第一个（最旧的）
    // 3. 插入新条目
  }
}
```

**Map 的插入顺序 = 天然的 LRU 数据结构：**

```
Map 内部状态:
  first → "file-a" (最旧，下次淘汰)
  ...
  last  → "file-d" (最新)

get("file-a") 后:
  first → "file-b" (现在最旧)
  ...
  last  → "file-a" (刚访问，移到末尾)
```

**Lazy TTL（惰性过期）：**
- 不用定时器清理过期条目
- 只在 `get()` 和 `has()` 时检查是否过期
- 过期了就删除并返回 `undefined`

### 2. Session Persistence (`src/memory/session.ts`)

```typescript
interface SessionData {
  readonly id: string;           // UUID
  readonly projectPath: string;
  readonly messages: readonly MessageParam[];
  readonly metadata: {
    readonly model: string;
    readonly totalTokensUsed: number;
    readonly toolCallCount: number;
  };
}
```

核心函数：

```typescript
// 创建 session（纯函数）
createSessionData(projectPath, messages, metadata): SessionData

// 持久化到 .angel-agent/sessions/{id}.json
saveSession(projectPath, session): Promise<void>

// 从文件加载
loadSession(projectPath, id): Promise<SessionData | null>

// 列出所有 session
listSessions(projectPath): Promise<SessionData[]>

// 删除
deleteSession(projectPath, id): Promise<boolean>
```

### 3. Project Memory (`src/memory/project-memory.ts`)

跨 session 的键值存储。所有函数遵循不可变模式：

```typescript
interface ProjectFact {
  readonly key: string;
  readonly value: string;
  readonly source: "user" | "agent" | "config";
}

// 添加/更新 fact（返回新对象）
saveFact(data, key, value, source): ProjectMemoryData

// 删除 fact（返回新对象）
removeFact(data, key): ProjectMemoryData

// 注入到系统提示
formatMemoryForPrompt(data): string
// → "## Project Memory\n- test_framework: vitest (user)\n- language: typescript (config)"
```

**不可变模式的好处：**

```typescript
// 每次操作返回新对象，原数据不变
const data1 = await loadMemory("/project");
const data2 = saveFact(data1, "framework", "react", "user");
const data3 = saveFact(data2, "language", "typescript", "agent");

// data1, data2, data3 是三个独立的快照
// 出错时可以回退到任意快照
```

### 4. Config Reader (`src/memory/config-reader.ts`)

读取 `.angel-agent.md` 文件，解析 `## 标题` 为 key-value：

```markdown
## System Prompt
You are a code review assistant.
Focus on security and performance.

## Style
Use TypeScript strict mode.
```

解析结果：
```typescript
{
  "System Prompt": "You are a code review assistant.\nFocus on security and performance.",
  "Style": "Use TypeScript strict mode."
}
```

## Agent Loop 集成

Phase 5 agent loop 在启动时：

```typescript
async function initContext() {
  // 1. 检测项目（Phase 3）
  const projectContext = await detectProject(cwd);

  // 2. 构建基础系统提示
  systemPrompt = buildSystemPrompt(tools, projectContext);

  // 3. 注入项目记忆
  memoryData = await loadMemory(cwd);
  const memorySection = formatMemoryForPrompt(memoryData);
  if (memorySection) {
    systemPrompt += "\n\n" + memorySection;
  }

  // 4. 读取自定义配置
  const config = await readAgentConfig(cwd);
  if (config["System Prompt"]) {
    systemPrompt += "\n\n" + config["System Prompt"];
  }
}
```

## REPL 命令

| 命令 | 功能 |
|------|------|
| `/save` | 保存当前对话到 session 文件 |
| `/resume` | 列出并恢复之前的 session |
| `/memory list` | 显示所有项目记忆 |
| `/memory set <key> <value>` | 保存一条记忆 |
| `/memory delete <key>` | 删除一条记忆 |
| `/agents` | 显示当前 session 中所有 sub-agent 状态 |

## 关键学习点

1. **文件持久化** — JSON 文件简单但有效，适合单用户 CLI
2. **不可变数据流** — 每次变更返回新对象，易于追踪和调试
3. **Lazy Eviction** — LRU Cache 不需要后台清理线程
4. **系统提示注入** — Memory 通过注入系统提示影响 agent 行为
5. **渐进增强** — 没有持久化文件时优雅降级（返回空数据）
