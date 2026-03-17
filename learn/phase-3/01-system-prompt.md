# Phase 3.1 — System Prompt Engineering：从硬编码到动态生成

## 你将学到

1. 系统提示（System Prompt）为什么决定 Agent 的行为
2. 如何动态构建系统提示：身份 + 工具 + 规则 + 项目上下文
3. 项目检测：自动读取 CLAUDE.md、package.json、Git 状态
4. 配置化设计：按需开关各个 prompt 模块

---

## 1. Phase 2 的问题

回顾 Phase 2 的 `types.ts`，系统提示是一句硬编码的字符串：

```typescript
export const DEFAULT_CONFIG: AgentConfig = {
  model: "claude-sonnet-4-6",
  maxTokens: 4096,
  systemPrompt: "You are a helpful coding assistant. Be concise.",
};
```

**问题：**
- Agent 不知道自己有哪些工具可用
- 没有项目上下文（不知道在哪个目录工作、项目用了什么技术栈）
- 没有安全规则（可能做出危险操作）
- 不同项目用同样的提示，无法定制化

**对比 Claude Code：**
Claude Code 的系统提示超过 10000 字，包含了角色定义、工具使用指南、安全边界、项目信息等丰富内容。这就是为什么它能像一个"懂你项目"的开发者一样工作。

---

## 2. 系统提示的结构

一个好的 Agent 系统提示应该包含 5 个模块：

```
┌─────────────────────────────────┐
│  1. Agent Identity              │  ← 我是谁，我能做什么
├─────────────────────────────────┤
│  2. Tool Instructions           │  ← 工具列表 + 使用指南
├─────────────────────────────────┤
│  3. Code Style Rules            │  ← 编码风格要求
├─────────────────────────────────┤
│  4. Safety Rules                │  ← 安全边界
├─────────────────────────────────┤
│  5. Project Context             │  ← 项目信息 + CLAUDE.md
└─────────────────────────────────┘
```

每个模块都可以独立开关，通过 `SystemPromptConfig` 控制：

```typescript
export interface SystemPromptConfig {
  agentIdentity: boolean;
  toolInstructions: boolean;
  codeStyleRules: boolean;
  safetyRules: boolean;
  projectContext: boolean;
}
```

---

## 3. 项目检测（Project Detection）

### 3.1 核心思路

Agent 启动时，自动扫描工作目录获取项目信息：

```
detectProject(cwd)
    ├── 检查 .git/ → 是否是 Git 仓库
    ├── 读取 CLAUDE.md → 项目特定指令
    ├── 读取 package.json → 依赖、描述、脚本
    ├── git branch → 当前分支
    └── git status → 工作区状态
```

### 3.2 ProjectContext 接口

```typescript
export interface ProjectContext {
  rootPath: string;              // 项目根目录
  name: string;                  // 目录名
  claudeMd: string | null;       // CLAUDE.md 内容
  packageJson: Record<string, unknown> | null;
  gitBranch: string | null;      // 当前分支
  gitStatus: string | null;      // git status 输出
  hasGit: boolean;               // 是否是 Git 仓库
}
```

### 3.3 实现要点

**并行检测**：用 `Promise.all` 同时读取多个文件和执行 Git 命令：

```typescript
const [claudeMd, packageJsonRaw, gitBranch, gitStatus] = await Promise.all([
  readFileIfExists(claudeMdPath),
  readFileIfExists(packageJsonPath),
  hasGit ? runGitCommand(rootPath, ["branch", "--show-current"]) : null,
  hasGit ? runGitCommand(rootPath, ["status", "--porcelain", "--short"]) : null,
]);
```

**优雅降级**：任何检测失败都返回 `null`，不会中断整个流程：

```typescript
async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;  // 文件不存在也没关系
  }
}
```

**安全执行 Git 命令**：用 `execFile`（不是 `exec`）防止命令注入，加 5 秒超时：

```typescript
async function runGitCommand(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}
```

> **为什么用 `execFile` 而不是 `exec`？**
> `exec` 会启动一个 shell 来解析命令字符串，存在命令注入风险。
> `execFile` 直接执行可执行文件，参数是数组，不经过 shell 解析。

---

## 4. System Prompt Builder

### 4.1 构建函数签名

```typescript
export function buildSystemPrompt(
  tools: Tool[],                              // 当前注册的工具
  projectContext: ProjectContext | null,       // 项目上下文
  config: SystemPromptConfig = DEFAULT_PROMPT_CONFIG  // 配置
): string
```

### 4.2 各模块生成

**Agent Identity — 告诉 Claude 它是谁：**

```typescript
function buildAgentIdentity(): string {
  return [
    "You are Angel Agent, an AI coding assistant...",
    "You can read, write, and edit files, run shell commands...",
    "You are thorough, careful, and always explain your reasoning...",
  ].join("\n");
}
```

**Tool Instructions — 根据实际注册的工具动态生成：**

```typescript
function buildToolInstructions(tools: Tool[]): string {
  const lines: string[] = ["## Available Tools", ""];
  for (const tool of tools) {
    lines.push(`- **${tool.name}** (${tool.riskLevel}): ${tool.description}`);
  }
  // + 使用指南
  return lines.join("\n");
}
```

关键点：工具列表是**动态生成的**，不是硬编码的。注册了新工具，系统提示自动更新。

**Project Context — 注入项目信息：**

CLAUDE.md 的内容会被嵌入到系统提示中，但有长度限制（2000 字符）：

```typescript
if (ctx.claudeMd) {
  const truncated = ctx.claudeMd.length > 2000
    ? ctx.claudeMd.slice(0, 2000) + "\n...(truncated)"
    : ctx.claudeMd;
  lines.push("## Project Instructions (CLAUDE.md)");
  lines.push(truncated);
}
```

### 4.3 组装策略

所有启用的模块按顺序拼接，用双换行分隔：

```typescript
const sections: string[] = [];
if (config.agentIdentity) sections.push(buildAgentIdentity());
if (config.toolInstructions) sections.push(buildToolInstructions(tools));
// ...
return sections.join("\n\n");
```

---

## 5. 集成到 Agent Loop

Phase 3 的 `agent-loop-with-context.ts` 在启动时初始化上下文：

```typescript
async function initContext(): Promise<void> {
  const cwd = process.cwd();
  const projectContext = await detectProject(cwd);
  const tools = registry.getAll();
  systemPrompt = buildSystemPrompt(tools, projectContext);
}
```

然后在每次 API 调用时使用动态生成的 system prompt：

```typescript
const response = await client.messages.create({
  model: DEFAULT_CONFIG.model,
  max_tokens: DEFAULT_CONFIG.maxTokens,
  system: systemPrompt,  // ← 动态生成，不再是硬编码
  tools: registry.toApiFormat(),
  messages,
});
```

---

## 6. 测试策略

测试重点：

1. **项目检测**：真实项目目录、不存在的目录、无 Git 的目录
2. **Prompt 构建**：各模块是否正确包含、配置开关是否生效
3. **边界情况**：空工具列表、超长 CLAUDE.md、无 package.json

```typescript
it("should respect config flags", () => {
  const config: SystemPromptConfig = {
    agentIdentity: false,
    toolInstructions: false,
    codeStyleRules: false,
    safetyRules: false,
    projectContext: false,
  };
  const prompt = buildSystemPrompt([mockTool], mockProject, config);
  expect(prompt).not.toContain("Angel Agent");
  expect(prompt).not.toContain("test_tool");
});
```

---

## 7. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Prompt 结构 | 模块化拼接 | 灵活开关，易于测试 |
| 项目检测 | Promise.all 并行 | 启动速度快 |
| 错误处理 | 优雅降级（null） | 不因检测失败而崩溃 |
| CLAUDE.md | 截断到 2000 字符 | 保护上下文窗口 |
| Git 命令 | execFile + timeout | 安全 + 防挂起 |

---

## 8. 思考题

1. 如果项目同时有 `CLAUDE.md` 和 `.cursorrules`，应该如何处理？
2. 动态系统提示会占用上下文窗口空间，应该如何平衡？
3. 不同编程语言的项目（Python vs TypeScript），系统提示应该有什么区别？
4. 如何让用户在运行时修改系统提示的某些部分？

---

## 下一步

系统提示解决了"Agent 知道什么"的问题。但随着对话越来越长，上下文窗口会溢出。下一节我们来解决这个问题 → **Context Window Management**。
