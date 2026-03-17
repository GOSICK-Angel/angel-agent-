# Phase 1.2 — Tool Use：让 Agent 干真正的活

## 你将学到

1. Claude 的 Tool Use 协议如何运作
2. 工具调用 → 工具结果 → 重新思考 的完整循环
3. 实现 `read_file` 和 `list_directory` 两个工具
4. 搭建完整的工具分发系统

---

## 1. 为什么工具如此重要？

没有工具，Claude 是一个**聊天机器人** — 只能生成文本。
有了工具，Claude 变成了一个 **Agent** — 可以与真实世界交互。

Claude Code 有大约 15 个工具：Read、Write、Edit、Bash、Glob、Grep 等。
我们从 2 个开始：`read_file` 和 `list_directory`。

---

## 2. Tool Use 协议详解

### 第 1 步：在 API 调用中定义工具

```typescript
const tools = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path" },
      },
      required: ["path"],
    },
  },
];
```

每个工具包含三部分：
- **name**：工具名称，Claude 用它来指定调用哪个工具
- **description**：工具描述，Claude 根据这个描述来决定**何时**使用这个工具
- **input_schema**：JSON Schema 格式的参数定义，Claude 据此生成正确的参数

### 第 2 步：Claude 决定使用工具

当 Claude 收到 "package.json 里有什么？" 这样的问题时，它返回：

```json
{
  "content": [
    { "type": "text", "text": "Let me read that file for you." },
    {
      "type": "tool_use",
      "id": "toolu_abc123",
      "name": "read_file",
      "input": { "path": "package.json" }
    }
  ],
  "stop_reason": "tool_use"
}
```

关键：`stop_reason` 是 `"tool_use"`，**不是** `"end_turn"`。这意味着 Claude **还没说完** — 它在等待工具的执行结果。

### 第 3 步：你的代码执行工具

```typescript
const fileContent = fs.readFileSync("package.json", "utf-8");
```

### 第 4 步：把工具结果发送回去

```typescript
messages.push({
  role: "user",  // 注意：tool_result 放在 "user" 角色的消息里！
  content: [
    {
      type: "tool_result",
      tool_use_id: "toolu_abc123",  // 必须匹配 tool_use 的 id！
      content: fileContent,
    },
  ],
});
```

### 第 5 步：Claude 带着结果重新思考

现在 Claude 的上下文里有了文件内容。它可以：
- 回答用户的问题
- 调用另一个工具
- 用不同的参数再次调用同一个工具

这个循环持续进行，直到 Claude 返回 `stop_reason: "end_turn"`。

---

## 3. 完整的工具循环流程

```
用户："package.json 里有什么？"
          ↓
调用 Claude API（带 tools 定义）
          ↓
Claude: [text: "让我读一下。", tool_use: read_file("package.json")]
          ↓  ← stop_reason = "tool_use"
你的代码：执行 read_file → 获取文件内容
          ↓
把 tool_result 追加到 messages
          ↓
再次调用 Claude API（同一个对话 + 工具结果）
          ↓
Claude: [text: "这是一个叫 angel-agent 的 Node.js 项目..."]
          ↓  ← stop_reason = "end_turn"
展示给用户 ✓
```

### 一次响应中的多个工具调用

Claude 可以在一次响应中请求**多个工具**：

```json
{
  "content": [
    { "type": "tool_use", "id": "toolu_1", "name": "read_file", "input": { "path": "package.json" } },
    { "type": "tool_use", "id": "toolu_2", "name": "list_directory", "input": { "path": "src/" } }
  ],
  "stop_reason": "tool_use"
}
```

你必须执行**所有**工具调用，并把**所有**结果一起返回，然后才能再次调用 API。

---

## 4. 代码实现

参见 `src/core/agent-loop-with-tools.ts`，这是完整的实现。

相比 Phase 1.1 的关键变化：
1. 定义工具 schema（`tools` 数组）
2. 在 API 调用时传入 `tools` 参数
3. 检查 `stop_reason === "tool_use"` 并循环
4. 执行工具，把 `tool_result` 追加到消息历史
5. 持续循环直到 `stop_reason === "end_turn"`

---

## 5. 工具设计原则

1. **描述要清晰** — Claude 根据 description 来决定何时调用工具，描述越准确，调用越精准
2. **输入 schema 要严格** — 在执行前验证输入参数
3. **返回有用的错误信息** — 文件不存在时返回 "Error: File not found: /path"，而不是让程序崩溃
4. **结果要简洁** — 不要返回一万行文件内容，需要截断处理

---

## 6. 与 Claude Code 的对比

| 特性 | 我们的 Agent | Claude Code |
|------|-------------|-------------|
| 工具数量 | 2 个 | ~15 个 |
| 权限检查 | 暂无 | 有（按风险等级分类） |
| 并行工具调用 | 支持（在响应中） | 支持 |
| 工具结果截断 | 基础 | 高级 |
| 流式输出 | 暂无 | 支持 |

我们会在后续阶段逐步补齐这些差距。

---

## 7. 动手练习

1. 运行带工具的 Agent：`npm run agent`
2. 问："当前目录下有哪些文件？"
3. 问："读一下 package.json，告诉我有哪些依赖"
4. 问："读一下 tsconfig.json，解释每个选项"
5. 试着问一个不存在的文件 — 观察错误处理是怎么工作的
6. 观察 token 用量 — 注意工具结果如何增加 input tokens

---

下一阶段：Phase 2 — 搭建完整工具系统（write_file、edit_file、run_command + 权限系统）
