# Phase 2.3 — Permission System：给 Agent 套上缰绳

## 你将学到

1. 为什么 Agent 需要权限系统
2. 风险分级策略
3. Session 级别的权限记忆
4. 在 Agent Loop 中集成权限检查

---

## 1. 为什么需要权限系统？

想象一下没有权限检查的 Agent：

```
用户："帮我整理一下项目"
Claude：我来清理不需要的文件。
  → run_command("rm -rf node_modules && rm -rf .git")   ← 没人阻止！
  → write_file(".gitignore", "")                          ← 覆盖了你的配置！
```

Agent 可能做出**你不期望的操作**。权限系统的作用：
- **读操作**自动放行 — 看看文件不会造成伤害
- **写操作**需要确认 — 改文件可能有副作用
- **危险操作**每次确认 — 执行命令可能造成不可逆影响

这就是 Claude Code 的权限模型：
- Read、Glob、Grep → 自动放行
- Write、Edit → 首次确认，可设为 session 内自动
- Bash → 每次确认（除非在 allowlist 里）

---

## 2. 风险分级

### 三级分类

```typescript
type RiskLevel = "read" | "write" | "dangerous";
```

| 级别 | 行为 | 对应工具 |
|------|------|---------|
| `read` | 自动放行 | read_file, list_directory |
| `write` | 首次确认，session 记忆 | write_file, edit_file |
| `dangerous` | 每次确认 | run_command |

### 分类器

```typescript
function needsConfirmation(riskLevel: RiskLevel): boolean {
  return riskLevel !== "read";
}

function alwaysConfirm(riskLevel: RiskLevel): boolean {
  return riskLevel === "dangerous";
}
```

两个函数，两个维度：
- `needsConfirmation` — 这个工具是否需要**任何**确认？
- `alwaysConfirm` — 是否**每次**都需要确认（不能 session 记忆）？

---

## 3. 权限决策

```typescript
type PermissionDecision = "allow" | "deny" | "allow_session";
```

用户面对权限提示时有三个选项：
- `y`（allow）— 本次允许
- `n`（deny）— 拒绝
- `a`（allow_session）— 本 session 内该工具全部允许

### 用户交互示例

```
[permission] Tool "write_file" wants to write to src/foo.ts
  Allow? (y = yes / n = no / a = allow all for this session) y

[permission] Tool "run_command" wants to execute: npm run build
  Allow? (y = yes / n = no / a = allow all for this session) a
```

---

## 4. PermissionManager — session 级权限记忆

```typescript
class PermissionManager {
  private sessionAllowed = new Set<string>();

  async checkPermission(tool: Tool, input: unknown): Promise<PermissionDecision> {
    // 1. read 工具 → 自动放行
    if (!needsConfirmation(tool.riskLevel)) {
      return "allow";
    }

    // 2. write 工具 + 已经 session 授权 → 自动放行
    if (!alwaysConfirm(tool.riskLevel) && this.sessionAllowed.has(tool.name)) {
      return "allow";
    }

    // 3. 其他情况 → 问用户
    const decision = await askPermission(tool.name, detail);

    // 4. 如果用户选了 "a" → 记住
    if (decision === "allow_session") {
      this.sessionAllowed.add(tool.name);
      return "allow";
    }

    return decision;
  }
}
```

决策流程图：

```
checkPermission(tool, input)
        │
        ▼
  riskLevel === "read"? ──── yes ──► allow（自动放行）
        │ no
        ▼
  riskLevel === "write"
  且 session 已授权? ──── yes ──► allow（session 记忆）
        │ no
        ▼
  询问用户 ──► "y" ──► allow
             ├─ "n" ──► deny
             └─ "a" ──► 记住 + allow
```

### 关键设计决策

**dangerous 工具不支持 session 记忆：**
```typescript
if (!alwaysConfirm(tool.riskLevel) && this.sessionAllowed.has(tool.name)) {
  return "allow";
}
```

即使用户对 `run_command` 选了 `a`，下次调用**仍然会询问**。因为每次命令都不同 — `ls` 很安全，但 `rm -rf *` 很危险。用户需要看到每条具体命令。

**write 工具支持 session 记忆：**
一旦用户允许了 `write_file`，后续所有 write_file 调用都自动放行。因为如果你允许 Claude 写一个文件，通常意味着你信任它在这个 session 里写文件。

---

## 5. 在 Agent Loop 中集成

```typescript
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const tool = registry.get(name);
  if (!tool) return `Error: Unknown tool: ${name}`;

  // ★ 权限检查
  const decision = await permissionManager.checkPermission(tool, input);
  if (decision === "deny") {
    return "Permission denied by user";
  }

  return tool.execute(input);
}
```

关键点：**拒绝不是错误**。当用户拒绝时，我们返回 `"Permission denied by user"` 作为 tool_result — Claude 收到这个结果后会优雅地处理：

```
Claude: I'd like to create the file for you.
  → write_file("src/foo.ts", "...") → 用户拒绝
Claude: I understand. You've denied the write permission.
        Would you like me to just show you the code instead?
```

---

## 6. 与 Claude Code 的对比

| 特性 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| 风险分级 | 3 级 | 多级 + 自定义 |
| 记忆粒度 | 工具级 | 工具+参数级 |
| 持久化 | session 内 | 可跨 session |
| 配置 | 无 | settings.json 配置 |
| 白名单 | 无 | allowedTools 配置 |

Claude Code 的权限系统更精细 — 比如你可以配置"允许 Bash 运行 `npm test`，但其他命令需要确认"。我们的实现是简化版，但核心逻辑一致。

---

## 7. 测试权限系统

权限系统的测试需要 mock 用户输入：

```typescript
// 在测试中 mock askPermission 函数
vi.mock("../../src/permissions/prompt.js", () => ({
  askPermission: vi.fn(),
}));

// 模拟用户选择 "allow_session"
mockAskPermission.mockResolvedValueOnce("allow_session");

// 验证 session 记忆生效
await manager.checkPermission(writeTool, {});  // 第一次 → 询问
await manager.checkPermission(writeTool, {});  // 第二次 → 自动放行
```

运行测试：
```bash
npx vitest run tests/permissions/
```

---

## 8. 核心要点

1. **分级控制** — read 自动放行，write 可记忆，dangerous 每次确认
2. **拒绝 ≠ 错误** — 返回 "Permission denied" 让 Claude 自己处理
3. **Session 记忆** — 减少重复确认的烦恼，但 dangerous 工具不记忆
4. **用户始终有控制权** — Agent 不能绕过权限系统

---

## 9. 动手练习

1. 运行 `npm run agent`，测试权限流程：
   - 让 Claude 读文件 → 自动放行，无提示
   - 让 Claude 写文件 → 出现权限确认
   - 选 `n` 拒绝 → 观察 Claude 如何回应
   - 让 Claude 再次写文件 → 选 `a` → 之后的写操作自动放行
   - 让 Claude 执行命令 → 即使选了 `a`，下次仍然询问

2. 运行测试观察行为：
   ```bash
   npx vitest run tests/permissions/manager.test.ts
   npx vitest run tests/permissions/classifier.test.ts
   ```

3. 思考扩展：
   - 如果要支持"允许 run_command 执行 `npm` 开头的命令"，需要怎么改？
   - 如果要跨 session 记住权限决策，需要什么存储？

---

## 10. Phase 2 完整回顾

Phase 2 做了三件事：

```
Phase 1（硬编码 2 工具）
    │
    ├─ Step 1: 注册表模式 ──► 可插拔的工具系统
    │
    ├─ Step 2: 3 个新工具 ──► Agent 能写代码、改代码、跑命令
    │
    └─ Step 3: 权限系统 ──► 安全的工具执行
    │
Phase 2（5 工具 + 权限）
```

文件结构：
```
src/
├── core/
│   ├── types.ts                    # 共享类型
│   ├── agent-loop.ts               # Phase 1.1: 基础聊天
│   └── agent-loop-with-tools.ts    # Phase 2: 注册表 + 权限
├── tools/
│   ├── types.ts                    # Tool 接口 + RiskLevel
│   ├── registry.ts                 # ToolRegistry 类
│   ├── read-file.ts                # read 级
│   ├── list-directory.ts           # read 级
│   ├── write-file.ts               # write 级
│   ├── edit-file.ts                # write 级
│   └── run-command.ts              # dangerous 级
└── permissions/
    ├── types.ts                    # PermissionDecision
    ├── classifier.ts               # 风险分类逻辑
    ├── prompt.ts                   # 用户交互提示
    └── manager.ts                  # Session 权限管理
```

下一阶段预告：**Phase 3 — Context Management**
- System Prompt 构建器
- 上下文窗口管理（当对话太长时怎么办？）
- 会话持久化
