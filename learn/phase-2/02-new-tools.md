# Phase 2.2 — 三个新工具：write_file、edit_file、run_command

## 你将学到

1. 写入和编辑文件的工具设计
2. 命令执行工具的安全考量
3. 工具设计中的防御性编程

---

## 1. 为什么需要这三个工具？

| 工具 | 能力 | 类比 |
|------|------|------|
| `read_file` | 读文件 | 只读权限 |
| `list_directory` | 看目录 | 只读权限 |
| **`write_file`** | 创建/覆写文件 | 编辑器的"新建文件" |
| **`edit_file`** | 精确修改文件 | 编辑器的"查找替换" |
| **`run_command`** | 执行 shell 命令 | 终端 |

有了前两个，Agent 只能"看"。有了后三个，Agent 可以"做" — 写代码、改代码、运行测试。

这也是 Claude Code 的核心工具集 — Read、Write、Edit、Bash 对应的就是这些。

---

## 2. write_file — 创建和覆写文件

### 设计思路

```typescript
const inputSchema = z.object({
  path: z.string(),     // 文件路径
  content: z.string(),  // 要写入的内容
});
```

关键设计决策：

**自动创建父目录：**
```typescript
fs.mkdirSync(path.dirname(resolved), { recursive: true });
```
当 Claude 要写入 `src/utils/helper.ts` 时，如果 `src/utils/` 不存在，自动创建。这模仿了 Claude Code 的行为 — Agent 不需要先创建目录再写文件。

**区分"新建"和"覆写"：**
```typescript
const existed = fs.existsSync(resolved);
const status = existed ? "Overwrote existing file" : "Created new file";
```
返回信息里告诉 Claude 是创建了新文件还是覆盖了已有文件，帮助它理解操作的影响。

**返回字节数：**
```typescript
const bytes = Buffer.byteLength(input.content, "utf-8");
return `${status}: ${filePath} (${bytes} bytes written)`;
```

---

## 3. edit_file — 精确字符串替换

### 为什么不用 write_file 代替？

想象 Claude 要修改一个 500 行的文件里的 3 行。用 `write_file` 的话，它需要生成完整的 500 行输出 — 浪费 token 且容易出错。`edit_file` 只需指定要替换的片段。

### 设计思路

```typescript
const inputSchema = z.object({
  path: z.string(),
  old_string: z.string(),   // 要被替换的内容
  new_string: z.string(),   // 替换后的内容
});
```

### 三个关键安全检查

**1. old_string 必须存在：**
```typescript
const firstIndex = content.indexOf(input.old_string);
if (firstIndex === -1) {
  return `Error: old_string not found in ${filePath}`;
}
```

**2. old_string 必须唯一：**
```typescript
const secondIndex = content.indexOf(input.old_string, firstIndex + 1);
if (secondIndex !== -1) {
  return `Error: old_string appears multiple times. Provide a more unique string.`;
}
```

为什么要求唯一？避免误替换。如果 `old_string` 在文件中出现 3 次，Claude 可能只想改其中 1 处。强制唯一匹配迫使 Claude 提供足够的上下文使替换精确。

这也是 Claude Code 的 Edit 工具的设计 — `old_string` 必须在文件中唯一。

**3. 返回上下文行：**
```typescript
function getContext(content: string, index: number, newStr: string): string {
  // 返回替换位置前后各 3 行
}
```
替换后返回修改处的上下文，帮助 Claude 验证替换是否正确。

### 为什么用精确字符串匹配而不是正则？

- 正则表达式的特殊字符（`.`、`*`、`(`、`)`）会导致意外匹配
- 代码中充满了正则特殊字符
- 精确匹配更安全、更可预测

---

## 4. run_command — 执行 shell 命令

这是最危险的工具，所以安全措施最多。

### 设计思路

```typescript
const inputSchema = z.object({
  command: z.string(),
  timeout: z.number().min(1).max(120).optional(),
});
```

### 安全层 1：危险命令黑名单

```typescript
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /mkfs\b/,                   // 格式化磁盘
  /format\s+[a-zA-Z]:/,       // Windows 格式化
  /dd\s+.*of=\/dev\//,        // 覆写磁盘
  />\s*\/dev\/sd[a-z]/,       // 重定向到磁盘
  /chmod\s+-R\s+777\s+\//,    // 递归改权限
  /chown\s+-R\s+.*\s+\//,     // 递归改所有者
];
```

在执行之前检查命令是否匹配任何危险模式。这不是银弹（能绕过），但能挡住最明显的危险操作。

### 安全层 2：超时限制

```typescript
execSync(command, {
  timeout: timeoutS * 1000,  // 默认 30 秒，最大 120 秒
  maxBuffer: 1024 * 1024,     // 最大 1MB 输出
});
```

防止命令无限运行或产生巨量输出。

### 安全层 3：工作目录限制

```typescript
execSync(command, {
  cwd: process.cwd(),  // 限制在项目根目录
});
```

### 安全层 4：权限系统（下一节详述）

`riskLevel: "dangerous"` 意味着**每次执行都需要用户确认**。

### 错误处理

命令失败时（非零退出码），返回结构化信息：

```typescript
const parts = [`Exit code: ${err.status}`];
if (stdout) parts.push(`stdout:\n${stdout}`);
if (stderr) parts.push(`stderr:\n${stderr}`);
```

这让 Claude 能理解命令为什么失败并采取下一步行动。

### 输出截断

```typescript
const MAX_OUTPUT = 10000;
if (result.length > MAX_OUTPUT) {
  return result.slice(0, MAX_OUTPUT) + `\n\n... [truncated]`;
}
```

防止巨量输出吃光上下文窗口。

---

## 5. 工具设计原则总结

| 原则 | 说明 | 例子 |
|------|------|------|
| **永不崩溃** | 所有错误都 catch，返回错误信息 | `"Error: File not found: ..."` |
| **返回有用信息** | 帮助 Claude 理解操作结果 | `"Created new file (128 bytes)"` |
| **限制爆炸半径** | 防止工具造成过大损害 | 超时、截断、黑名单 |
| **强制精确性** | 避免模糊操作 | edit_file 要求唯一匹配 |
| **分层安全** | 多层防护，不依赖单一机制 | 黑名单 + 权限 + 超时 |

---

## 6. 与 Claude Code 的对比

| 特性 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| write_file | 基础写入 | 支持 diff 预览 |
| edit_file | 精确替换 | 支持多段替换、replace_all |
| run_command | execSync 阻塞 | 支持流式输出、后台运行 |
| 安全检查 | 正则黑名单 | 更完善的沙箱 |
| 输出限制 | 10KB 截断 | 智能截断 + 摘要 |

---

## 7. 动手练习

1. 运行 `npm run agent`，让 Claude 创建一个新文件：
   - "创建一个 hello.ts 文件，输出 Hello World"
   - 观察 write_file 工具被调用的过程
2. 让 Claude 修改刚创建的文件：
   - "把 Hello World 改成 Hello Angel"
   - 观察 edit_file 的唯一匹配机制
3. 让 Claude 执行命令：
   - "运行 ls 命令看看当前目录"
   - "运行 npm run build"
4. 测试工具边界条件：
   - 运行 `npx vitest run tests/tools/edit-file.test.ts` — 看多次匹配的错误处理
   - 运行 `npx vitest run tests/tools/run-command.test.ts` — 看危险命令的拦截

---

下一节：[03-permission-system.md](./03-permission-system.md) — 不是所有工具调用都应该自动执行
