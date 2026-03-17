# Phase 4.2: Streaming UX

## Overview

Phase 4 replaces the synchronous `messages.create()` call with `messages.stream()`, enabling real-time character-by-character output. Combined with colored terminal output, spinners, and Ctrl+C handling, this creates a professional CLI experience.

## Key Changes

### 1. Streaming API

**Before (Phase 3):**
```typescript
const response = await client.messages.create({
  model, max_tokens, system, tools, messages
});
// Wait for entire response, then display
console.log(response.content[0].text);
```

**After (Phase 4):**
```typescript
const stream = client.messages.stream({
  model, max_tokens, system, tools, messages
}, { signal: abortController.signal });

for await (const event of stream) {
  if (event.type === "content_block_delta") {
    if (event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text); // Real-time output!
    }
  }
}

const finalMessage = await stream.finalMessage(); // Full message for history
```

### Stream Event Types

| Event | When | Action |
|-------|------|--------|
| `content_block_start` | New text/tool_use block begins | Start rendering or show spinner |
| `content_block_delta` | Incremental content | Write text or buffer tool input JSON |
| `content_block_stop` | Block complete | Finalize tool call parsing |
| `message_stop` | Response complete | Process final message |

### 2. StreamRenderer Class

The `StreamRenderer` encapsulates all output logic:

```typescript
export class StreamRenderer {
  onText(delta: string): void {
    process.stdout.write(delta); // Character-by-character
  }

  onToolUseStart(name: string, id: string): void {
    this.toolSpinner = startSpinner(`Running ${name}...`);
  }

  onToolUseComplete(name, input, result, isError): void {
    if (isError) {
      this.toolSpinner.fail(formatToolError(name, result));
    } else {
      this.toolSpinner.succeed(formatToolCall(name, input));
    }
  }

  flush(): void {
    // Clean up any pending output
  }
}
```

### 3. Colored Terminal Output

Using `picocolors` (lightweight, no dependencies):

```typescript
import pc from "picocolors";

export const dim = (s: string): string => pc.dim(s);
export const bold = (s: string): string => pc.bold(s);
export const green = (s: string): string => pc.green(s);
export const red = (s: string): string => pc.red(s);

export function toolLabel(name: string): string {
  return pc.bold(pc.cyan(`[${name}]`));
}
```

Why `picocolors` over `chalk`?
- **Zero dependencies** (chalk has many)
- **2x faster** performance
- **Smaller bundle** (~2KB vs ~40KB)
- **Same API** for basic use cases

### 4. Spinners with `ora`

Spinners show activity during tool execution:

```typescript
import ora from "ora";

export function startSpinner(text: string): SpinnerHandle {
  const spinner = ora({ text, spinner: "dots" }).start();
  return {
    update(newText) { spinner.text = newText; },
    succeed(msg) { spinner.succeed(msg); },
    fail(msg) { spinner.fail(msg); },
    stop() { spinner.stop(); },
  };
}
```

Visual flow:
```
You> Read the config file
Assistant> Let me read the configuration file.
⠋ Running read_file...          ← spinner while tool executes
✓ [read_file] path="/config.json"  ← success with formatted params
The config file contains...      ← streaming text continues
```

### 5. Ctrl+C Handling

Two-level interrupt system:

```typescript
function setupCtrlC(): void {
  let ctrlCCount = 0;
  let ctrlCTimer: ReturnType<typeof setTimeout> | null = null;

  process.on("SIGINT", () => {
    ctrlCCount++;

    if (ctrlCCount >= 2) {
      process.exit(0); // Double Ctrl+C = exit
    }

    if (abortController) {
      abortController.abort(); // Single Ctrl+C = cancel current stream
    }

    ctrlCTimer = setTimeout(() => { ctrlCCount = 0; }, 1000);
  });
}
```

The `AbortController` is passed to the stream call:
```typescript
const stream = client.messages.stream(params, {
  signal: abortController.signal
});
```

When aborted:
1. The stream throws an `AbortError`
2. The catch block saves partial text to history
3. Control returns to the prompt

### 6. REPL Commands

Phase 4 adds special REPL commands:

| Command | Action |
|---------|--------|
| `/plan` | Show current task plan with step status |
| `/stats` | Show loop guard statistics |
| `/reset` | Clear conversation, plan, and loop guard |
| `exit` | Quit the agent |

## Architecture: Event Flow

```
User types message
       ↓
  chatStreaming()
       ↓
  messages.stream() ──→ AbortController (Ctrl+C)
       ↓
  for await (event) ─┬─ text_delta → process.stdout.write()
                     ├─ tool_use start → startSpinner()
                     ├─ input_json_delta → buffer JSON
                     └─ block_stop → parse tool input
       ↓
  stream.finalMessage()
       ↓
  stop_reason? ─┬─ "end_turn" → show text, parse plan
                └─ "tool_use" → execute tools → loop back
```

## Tool Display Formatting

```typescript
// Tool call: shows name and params
formatToolCall("read_file", { path: "/src/index.ts" })
// → [read_file] path="/src/index.ts"

// Tool result: shows name, status, and preview
formatToolResult("read_file", "const x = 1;\nconst y = 2;...")
// → [read_file] ✓ (42 chars, 2 lines)

// Tool error: shows name and error message
formatToolError("write_file", "Permission denied")
// → [write_file] ✗ Permission denied
```

## Summary

Phase 4 transforms the agent from a batch-response system to a real-time interactive experience:

| Feature | Phase 3 | Phase 4 |
|---------|---------|---------|
| Output | Wait → dump all | Character-by-character streaming |
| Tool status | Plain text log | Spinner + colored formatting |
| Errors | Silent retry | Loop guard + warnings |
| Planning | None | Auto-detected + tracked |
| Interrupt | Exit only | Ctrl+C cancels, double exits |
| Terminal | Monochrome | Colored with semantic formatting |
