# Phase 6.1: Error Recovery & Robustness

## 概述

在 Phase 1-5 中，我们构建了一个功能完善的 AI Agent。但在生产环境中，各种错误随时可能发生：API 速率限制、网络超时、工具执行失败等。Phase 6.1 的目标是让 Agent 能够**优雅地处理这些错误**，而不是直接崩溃。

我们将实现三个核心模块：

1. **结构化日志** — 可追踪的日志系统
2. **API 重试** — 指数退避 + 抖动
3. **工具降级** — 超时保护 + 失败追踪

## 1. 结构化日志 (Logger)

### 为什么需要结构化日志？

`console.log` 的问题：
- 无法按级别过滤（debug 信息在生产环境是噪音）
- 无法追踪来源（哪个模块打印的？）
- 无法回溯（日志一闪而过，无法事后查看）

### 设计

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  readonly level: LogLevel;
  readonly module: string;      // e.g., "retry", "tool-fallback"
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly timestamp: number;
}
```

核心思路：

- **级别过滤**：为每个级别分配数值（debug=0, info=1, warn=2, error=3），只输出 >= 当前级别的日志
- **环形缓冲区**：保留最近 1000 条日志在内存中，支持 `/logs` 命令回溯
- **模块前缀**：每个 `createLogger("module")` 创建独立的 logger，自动添加模块名

```typescript
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

function createLogger(module: string): Logger {
  let entries: readonly LogEntry[] = [];
  let currentLevel: LogLevel = "info";

  function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

    const entry: LogEntry = { level, module, message, ...(data ? { data } : {}), timestamp: Date.now() };
    const updated = [...entries, entry];
    entries = updated.length > 1000 ? updated.slice(-1000) : updated;
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
    setLevel: (level) => { currentLevel = level; },
    getEntries: () => entries,
  };
}
```

### 关键点

- **不可变更新**：每次添加日志都创建新数组（`[...entries, entry]`），而非 `push`
- **惰性裁剪**：只在超过 1000 条时裁剪，避免每次都 slice
- **闭包封装**：通过闭包保持状态，而非 class 的 private 字段

## 2. API 重试与指数退避

### 为什么需要重试？

Claude API 的常见错误：
- **429 (Rate Limited)**：请求太快，需要等待
- **500/502/503 (Server Error)**：API 暂时不可用
- **529 (Overloaded)**：服务器过载

这些都是**暂态错误**——稍等片刻通常就能恢复。

### 指数退避算法

```
delay = min(baseDelay × 2^attempt + jitter, maxDelay)
```

| Attempt | Base Delay | Exponential | + Jitter (0-500ms) | Actual |
|---------|-----------|-------------|-------------------|--------|
| 0 | 1000ms | 1000ms | ~1200ms | ~1.2s |
| 1 | 1000ms | 2000ms | ~2300ms | ~2.3s |
| 2 | 1000ms | 4000ms | ~4100ms | ~4.1s |
| 3 | 1000ms | 8000ms | ~8400ms | ~8.4s |

**为什么需要 Jitter（抖动）？**

如果所有客户端在完全相同的时刻重试，会导致"惊群效应"（thundering herd）。添加随机 jitter 可以分散重试时间，避免再次同时打爆 API。

### 实现

```typescript
async function withRetry<T>(fn: () => Promise<T>, config?: Partial<RetryConfig>): Promise<T> {
  const merged = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= merged.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === merged.maxRetries) break;

      // 400/401/403 are non-retryable
      if (!isRetryable(error, merged)) throw error;

      // 429: respect retry-after header
      const retryAfterDelay = getRetryAfter(error);
      const delay = retryAfterDelay ?? calculateBackoff(attempt, merged);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

### 关键设计决策

1. **不可重试的错误立即抛出**：400（请求错误）、401（未认证）、403（禁止）不应重试
2. **尊重 retry-after**：429 响应通常包含 `retry-after` 头，告诉你应该等多久
3. **泛型包装**：`withRetry<T>` 可以包装任何异步操作，不仅限于 API 调用

## 3. 工具降级 (Tool Fallback)

### 问题场景

- 读取一个大文件，耗时超过 30 秒
- 执行命令时文件被锁定
- 外部工具返回了意外错误

### 设计策略

```typescript
async function executeWithFallback(
  tool: Tool,
  input: Record<string, unknown>,
  options?: { timeout?: number; retries?: number }
): Promise<FallbackResult>
```

三层防护：

1. **超时保护**：默认 30 秒，超时后返回友好错误（而非无限等待）
2. **自动重试**：默认重试 1 次（适用于文件锁定等瞬态错误）
3. **失败追踪**：记录每个工具的失败次数，为未来的熔断器做准备

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}
```

### FallbackResult 的意义

```typescript
interface FallbackResult {
  result: string;       // 结果内容或错误消息
  isError: boolean;     // 是否出错
  fallbackUsed: boolean; // 是否使用了降级策略
  originalError?: string; // 原始错误（如果降级了）
}
```

`fallbackUsed` 字段让调用方知道这不是正常结果，可以据此做进一步处理（如日志记录、通知用户）。

## 4. Max Turns 安全机制

### 为什么需要限制？

AI Agent 在工具循环中可能陷入无限循环。虽然 LoopGuard 已经检测重复调用，但 Max Turns 提供了终极保险：

```typescript
let turnCount = 0;
const maxTurns = 100;

function checkTurnLimit(): boolean {
  turnCount++;
  if (turnCount >= maxTurns) {
    // Hard stop
    return false;
  }
  if (turnCount >= maxTurns * 0.8) {
    // Warning at 80%
    console.log(yellow(`Turn ${turnCount}/${maxTurns}`));
  }
  return true;
}
```

在 `chatStreaming` 的主循环中，每次 API 调用前检查：

```typescript
while (true) {
  if (!checkTurnLimit()) return "[Max turns reached]";
  // ... API call ...
}
```

## 总结

| 模块 | 解决的问题 | 策略 |
|------|-----------|------|
| Logger | 调试困难、无法回溯 | 结构化日志 + 内存缓冲 |
| Retry | API 暂态错误 | 指数退避 + Jitter + retry-after |
| Fallback | 工具超时/失败 | 超时包装 + 自动重试 + 失败追踪 |
| Max Turns | 无限循环 | 硬限制 + 80% 预警 |

这四个模块组合在一起，让 Agent 从"能用"变为"稳定可用"。下一节将介绍如何让 Agent 变得"可扩展"。
