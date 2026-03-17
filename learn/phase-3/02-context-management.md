# Phase 3.2 — Context Window Management：上下文窗口管理

## 你将学到

1. 上下文窗口为什么是 Agent 的核心瓶颈
2. Token 估算：不需要分词器也能做预算
3. 两级压缩策略：工具结果压缩 → 消息丢弃
4. 何时触发压缩，如何保护最近的对话

---

## 1. 问题：上下文窗口会被撑爆

### 1.1 Claude 的上下文窗口

Claude 是**无状态**的。每次 API 调用，你都要把完整的对话历史发过去：

```
┌──────────────────────────────────────┐
│  System Prompt        ~2000 tokens   │
├──────────────────────────────────────┤
│  Message 1 (user)     ~100 tokens    │
│  Message 2 (assistant) ~200 tokens   │
│  Message 3 (tool_result) ~5000 tokens│  ← 一个文件内容就占很多
│  Message 4 (assistant) ~300 tokens   │
│  ...                                 │
│  Message N (user)     ~50 tokens     │
├──────────────────────────────────────┤
│  Reserved for response  4096 tokens  │
└──────────────────────────────────────┘
        Total ≤ 200,000 tokens
```

一个 Agent 对话很容易超出限制：
- 每次 `read_file` 返回可能有上千行代码
- `run_command` 的输出可能很长
- 多轮工具调用累积很快

### 1.2 后果

如果不管理上下文：
- API 返回错误：`context_length_exceeded`
- 或者 Agent 的推理质量下降（上下文末尾 20% 区域推理能力降低）

---

## 2. Token 估算

### 2.1 为什么不用真正的 Tokenizer？

真正的 tokenizer（如 tiktoken）需要额外依赖，而且：
- Claude 的 tokenizer 没有公开的 JS 库
- 我们只需要**粗略估算**来做预算控制

### 2.2 字符估算法

经验法则：英文文本大约 **4 个字符 = 1 个 token**。

```typescript
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

这个估算够用吗？对于预算控制来说，完全够用。我们在 80% 的时候就触发压缩，留了 20% 的余量来吸收估算误差。

### 2.3 消息数组的 Token 估算

```typescript
export function estimateMessagesTokens(messages: MessageParam[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(messageToText(msg));
    total += 4;  // overhead per message (role, formatting)
  }
  return total;
}
```

要处理消息内容的多种格式：
- 纯字符串：`"Hello"`
- ContentBlock 数组：`[{ type: "text", text: "Hello" }]`
- Tool result 数组：`[{ type: "tool_result", content: "..." }]`

---

## 3. Token 预算模型

### 3.1 预算结构

```typescript
export interface TokenBudget {
  maxTokens: number;           // 模型总限制（200k）
  reservedForResponse: number;  // 留给回复的空间（4096）
  reservedForSystem: number;    // 系统提示的预留（4000）
}
```

### 3.2 可用空间计算

```
可用空间 = maxTokens - reservedForResponse - systemPromptTokens
```

```typescript
getAvailableBudget(systemPromptTokens: number): number {
  return this.budget.maxTokens - this.budget.reservedForResponse - systemPromptTokens;
}
```

### 3.3 触发阈值

在 **80% 使用率**时触发压缩，不等到满了才处理：

```typescript
needsCompaction(messages, systemTokens): boolean {
  const available = this.getAvailableBudget(systemTokens);
  const used = estimateMessagesTokens(messages);
  return used > available * 0.8;  // 80% 预警线
}
```

> **为什么是 80%？**
> 留出缓冲空间应对估算误差和突发的大消息。就像磁盘管理一样，不要等到 100% 才清理。

---

## 4. 两级压缩策略

### 4.1 策略概览

```
消息数组超过 80% 预算
    │
    ▼
Level 1: 压缩旧的 tool_result
    │
    │ 如果还是太大
    ▼
Level 2: 丢弃最老的消息对
```

### 4.2 Level 1：Tool Result 压缩

旧的工具结果（通常是文件内容、命令输出）是最大的 token 消耗者。

**策略：** 保留最近 10 条消息不动，压缩更早的 tool_result：

```typescript
function compactToolResult(block: ToolResultBlockParam): ToolResultBlockParam {
  const content = typeof block.content === "string"
    ? block.content
    : JSON.stringify(block.content);

  if (content.length <= 500) {
    return block;  // 小结果不压缩
  }

  const summary = `[Compacted: ${content.length} chars, ${lineCount} lines — removed to save context]`;
  return { ...block, content: summary };
}
```

**为什么保留最近 10 条？**
- Agent 最近的操作上下文很重要（刚读的文件、刚执行的命令）
- 太早的工具结果对当前推理帮助不大
- 10 条大约覆盖 2-3 轮工具调用

### 4.3 Level 2：消息丢弃

如果压缩 tool result 还不够，就从最老的消息开始丢弃：

```typescript
function dropOldestMessages(messages, targetTokens): CompactionResult {
  const result = [...messages];
  while (result.length > 4 && estimateMessagesTokens(result) > targetTokens) {
    result.splice(0, 2);  // 成对删除（user + assistant）
  }
  return result;
}
```

**关键设计：**
- 成对删除（user + assistant），保持消息格式合法
- 至少保留 4 条消息（最近的 2 轮对话）
- 目标是降到 70% 使用率（留出更多空间）

---

## 5. 工具结果截断

除了压缩策略，还在工具执行时就做截断：

```typescript
export function truncateToolResult(content: string, maxChars: number = 10000): string {
  if (content.length <= maxChars) {
    return content;
  }
  const half = Math.floor(maxChars / 2);
  const omitted = content.length - maxChars;
  return (
    content.slice(0, half) +
    `\n\n... [${omitted} characters omitted] ...\n\n` +
    content.slice(-half)
  );
}
```

**保留头尾的策略：**
- 文件的开头通常有 import、类型定义
- 文件的结尾通常有 export、主要逻辑
- 中间部分是最可以牺牲的

---

## 6. 集成到 Agent Loop

在 `agent-loop-with-context.ts` 中的集成点：

### 6.1 每轮对话前检查

```typescript
async function chat(userMessage: string): Promise<string> {
  messages.push({ role: "user", content: userMessage });

  const systemTokens = estimateTokens(systemPrompt);

  if (contextManager.needsCompaction(messages, systemTokens)) {
    const result = contextManager.compact(messages, systemTokens);
    messages = result.messages;
    console.log(`[context] Compacted: saved ~${result.estimatedTokensSaved} tokens`);
  }

  // ... 正常的 API 调用
}
```

### 6.2 工具执行时截断

```typescript
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  // ... 权限检查
  const result = await tool.execute(input);
  return contextManager.truncateFileContent(result);  // ← 截断大结果
}
```

### 6.3 实时监控

每次 API 调用后显示上下文使用情况：

```
[tokens: in=12345, out=678, context=~9000, stop=end_turn]
```

---

## 7. 完整的上下文管理流程

```
用户输入
    │
    ▼
追加到 messages[]
    │
    ▼
检查是否需要压缩 ─── 否 ──→ 发送 API 请求
    │
    是
    │
    ▼
Level 1: 压缩旧 tool_result
    │
    ▼
还是太大？ ─── 否 ──→ 发送 API 请求
    │
    是
    │
    ▼
Level 2: 丢弃最老的消息对
    │
    ▼
发送 API 请求
    │
    ▼
收到响应
    │
    ├── stop_reason = "end_turn" → 显示文本
    │
    └── stop_reason = "tool_use" → 执行工具
                                       │
                                       ▼
                                  截断大结果
                                       │
                                       ▼
                                  追加 tool_result → 回到检查步骤
```

---

## 8. 测试策略

### 8.1 Token 估算测试

```typescript
describe("estimateTokens", () => {
  it("should estimate ~1 token per 4 chars", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});
```

### 8.2 截断测试

```typescript
it("should keep start and end of content", () => {
  const content = "START" + "x".repeat(20000) + "END";
  const result = truncateToolResult(content, 10000);
  expect(result).toContain("START");
  expect(result).toContain("END");
  expect(result).toContain("characters omitted");
});
```

### 8.3 压缩触发测试

```typescript
it("should detect when compaction is needed", () => {
  const manager = new ContextManager({ maxTokens: 1000, ... });
  const bigMessages = Array.from({ length: 50 }, () => ({
    role: "user", content: "x".repeat(100),
  }));
  expect(manager.needsCompaction(bigMessages, 100)).toBe(true);
});
```

---

## 9. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Token 估算 | 字符/4 | 够用且零依赖 |
| 触发阈值 | 80% | 留缓冲，防溢出 |
| 保护范围 | 最近 10 条 | 覆盖 2-3 轮工具调用 |
| 截断策略 | 保留头尾 | 文件头尾信息密度高 |
| 压缩顺序 | 先压缩后丢弃 | 尽量保留对话连贯性 |
| 丢弃单位 | user+assistant 对 | 保持消息格式合法 |

---

## 10. 思考题

1. 字符/4 的估算对中文文本准确吗？如何改进？
2. 除了压缩和丢弃，还有什么上下文管理策略？（提示：摘要）
3. 如果 Agent 正在做一个跨多文件的重构，最老的消息可能包含重要的文件内容。如何避免错误地丢弃它们？
4. Claude Code 实际使用的上下文管理策略是什么？它如何做"conversation compaction"？

---

## 11. 与 Claude Code 的对比

| 特性 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| Token 计数 | 字符估算 | 精确 tokenizer |
| 压缩策略 | 工具结果压缩 + 消息丢弃 | 自动摘要（summarization） |
| 触发时机 | 80% 阈值 | 更精细的分层策略 |
| 文件截断 | 10000 字符 | 按需加载，支持行范围 |

我们的实现是一个功能完整的最小版本。生产环境中，你会想要：
- 更精确的 token 计数
- 用 LLM 做对话摘要（而不是简单丢弃）
- 更智能的"什么该保留"决策

---

## 下一步

Phase 3 完成后，我们的 Agent 已经具备了：
- ✅ 工具系统（Phase 2）
- ✅ 权限控制（Phase 2）
- ✅ 动态系统提示（Phase 3.1）
- ✅ 上下文窗口管理（Phase 3.2）

下一阶段 → **Phase 4: Advanced Agent Patterns**（多步推理、流式输出、错误恢复）
