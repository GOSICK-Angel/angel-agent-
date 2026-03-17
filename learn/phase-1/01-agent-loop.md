# Phase 1.1 — Agent Loop：每个 AI Agent 的核心

## 你将学到

1. 什么是 Agent Loop，为什么它是关键
2. Claude Code 底层是怎么运作的
3. 从零搭建一个可运行的聊天 REPL

---

## 1. 什么是 Agent Loop？

所有 AI Agent — Claude Code、Cursor、Copilot — 都遵循同一个基本模式：

```
while (没有结束) {
    response = LLM.思考(对话历史)

    if (response 想要使用工具) {
        result = 执行工具(response.tool_call)
        对话历史.追加(result)
        continue  // 让 LLM 带着结果重新思考
    }

    展示给用户(response.text)
    user_input = 等待用户输入()
    对话历史.追加(user_input)
}
```

这就是 **ReAct 模式**（Reasoning + Acting，推理 + 行动）：
- **Reasoning（推理）**：LLM 分析当前情况，决定下一步做什么
- **Acting（行动）**：LLM 调用工具与真实世界交互
- **Observing（观察）**：LLM 看到工具返回的结果，再次推理

### 为什么这很重要？

没有循环，LLM 只是一个聊天机器人 — 它只能说话。有了循环，它变成了一个 **Agent** — 它可以读文件、写代码、执行命令、完成真正的任务。

### Claude Code 的循环（简化版）

```
1. 用户输入一条消息
2. Claude 接收到：system prompt + 对话历史 + 工具定义
3. Claude 返回以下两种之一：
   a. 文本 → 展示给用户，等待下一条输入
   b. 工具调用 → 执行工具 → 把结果送回 → 回到第 2 步
4. 重复
```

关键点：Claude 可以在给出最终回答之前**连续调用多个工具**。例如：
- "修复 auth.ts 里的 bug" →
  - Claude 调用 `read_file("auth.ts")` → 看到代码
  - Claude 调用 `grep("error", "src/")` → 找到相关错误
  - Claude 调用 `edit_file("auth.ts", ...)` → 修复 bug
  - Claude 回复："我已修复 auth.ts 第 42 行的空值检查"

---

## 2. Messages API — 我们如何与 Claude 通信

Claude API 使用 **messages（消息）** 格式。每次 API 调用都发送完整的对话：

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: "You are a helpful coding assistant.",  // system prompt
  messages: [
    { role: "user", content: "Hello" },                          // 第 1 轮
    { role: "assistant", content: "Hi! How can I help?" },       // 第 2 轮
    { role: "user", content: "What is TypeScript?" },            // 第 3 轮
  ],
});
```

核心概念：
- **system**：定义 Agent 行为的指令（每次都发送，不展示给用户）
- **messages**：对话历史，`user` 和 `assistant` 角色交替出现
- **response.content**：内容块数组（text 或 tool_use）
- **response.stop_reason**：Claude 停止的原因 — `"end_turn"`（说完了）或 `"tool_use"`（想调用工具）

---

## 3. 搭建我们的第一个 Agent Loop

### 第 1 步：项目初始化

```bash
# 初始化项目
npm init -y
npm install @anthropic-ai/sdk
npm install -D typescript tsx @types/node

# 创建 tsconfig
npx tsc --init
```

### 第 2 步：最简 Agent Loop

参见 `src/core/agent-loop.ts` — 这是我们的第一个可运行实现。

代码做了这些事：
1. 创建 Anthropic 客户端（自动读取环境变量 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`）
2. 启动 readline 界面接收用户输入
3. 每收到一条用户消息：
   - 追加到对话历史
   - 把完整历史发送给 Claude API
   - 展示 Claude 的回复
   - 把回复追加到历史
4. 无限循环，直到用户输入 `exit`

### 第 3 步：理解响应结构

Claude 的响应长这样：

```typescript
{
  id: "msg_xxx",
  type: "message",
  role: "assistant",
  content: [
    { type: "text", text: "Hello! How can I help you?" }
  ],
  stop_reason: "end_turn",    // 或 "tool_use"
  usage: {
    input_tokens: 25,         // 输入消耗的 token 数
    output_tokens: 12          // 输出消耗的 token 数
  }
}
```

`content` 是一个**数组**，因为 Claude 可以返回多个内容块：
- `{ type: "text", text: "..." }` — 普通文本
- `{ type: "tool_use", id: "...", name: "...", input: {...} }` — 工具调用（Phase 1.2 会学）

---

## 4. 核心要点

1. **Agent Loop 就是一个 while 循环** — 没有什么魔法
2. **对话历史是无状态的** — 每次 API 调用都发送完整历史，服务端不保存任何状态
3. **LLM 自己不记忆** — 你的代码负责维护 `messages[]` 数组
4. **stop_reason 告诉你下一步做什么** — `end_turn` = 展示文本，`tool_use` = 执行工具
5. **Token 用量很重要** — 按 token 计费，而且有上下文窗口限制

---

## 5. 动手练习

运行基础 Agent Loop 后：

1. 试试多轮对话 — 注意 Claude 如何记住上下文
2. 观察 `usage` 字段 — 看 input tokens 如何随每轮对话增长
3. 试着去掉对话历史（每次只发最新一条消息）— 注意 Claude 会丢失上下文
4. 思考：当对话变得非常长时，会发生什么？

这些观察将引出 Phase 1.2（工具使用）和 Phase 3（上下文管理）。

---

下一节：[02-tool-use-basics.md](./02-tool-use-basics.md) — 让 Agent 用工具干真正的活
