# Technical Stack & Architecture

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| **Language** | TypeScript | Claude Code itself is built with TS; learning this stack lets you read its source |
| **Runtime** | Node.js 20+ | Best CLI ecosystem, official SDK support |
| **AI SDK** | `@anthropic-ai/sdk` | Anthropic official TypeScript SDK, handles auth/streaming/retry/types |
| **Validation** | Zod | Tool input schema validation, industry standard |
| **Terminal UI** | chalk + readline | Colored output + streaming input, no heavy framework |
| **Testing** | Vitest | Fast, native TS support |
| **Build** | tsx | Run TS directly during development, zero config |

## Claude API Overview

API docs: https://platform.claude.com/docs/en/api/overview

### Core APIs We'll Use

| API | Endpoint | Purpose in Our Agent |
|-----|----------|---------------------|
| **Messages API** | `POST /v1/messages` | The core — send user messages, receive assistant responses with tool calls |
| **Token Counting** | `POST /v1/messages/count_tokens` | Context window management |
| **Models API** | `GET /v1/models` | List available models |

### Authentication

All requests require:
- `x-api-key`: Your API key from https://platform.claude.com/settings/keys
- `anthropic-version`: API version (e.g., `2023-06-01`)
- `content-type`: `application/json`

The SDK handles these headers automatically.

### Official SDKs (7 Languages)

| Language | Package | Install |
|----------|---------|---------|
| **TypeScript** (our choice) | `@anthropic-ai/sdk` | `npm install @anthropic-ai/sdk` |
| Python | `anthropic` | `pip install anthropic` |
| Go | `anthropic-sdk-go` | `go get github.com/anthropics/anthropic-sdk-go` |
| Java | `anthropic-java` | Maven/Gradle |
| C# | `Anthropic` | `dotnet add package Anthropic` |
| Ruby | `anthropic` | `bundler add anthropic` |
| PHP | `anthropic-ai/sdk` | `composer require anthropic-ai/sdk` |

GitHub repos: https://github.com/anthropics/anthropic-sdk-typescript

### SDK Features We Rely On

- **Automatic header management** — no manual auth header setup
- **Type-safe requests/responses** — full TypeScript types for tool_use, tool_result, etc.
- **Built-in retry logic** — handles transient API errors
- **Streaming support** — token-by-token output for real-time UX
- **Error handling** — structured error types (rate limit, auth, etc.)

### Minimal SDK Usage

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const message = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude" }],
});

console.log(message.content);
```

### Tool Use — The Key to Building an Agent

```typescript
const message = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  tools: [
    {
      name: "read_file",
      description: "Read the contents of a file",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
    },
  ],
  messages: [{ role: "user", content: "Read package.json" }],
});

// response.content may contain:
// [{ type: "text", text: "Let me read that file." },
//  { type: "tool_use", id: "toolu_xxx", name: "read_file", input: { path: "package.json" } }]
```

## Architecture: Agent Loop

```
┌─────────────┐
│  User Input  │
└──────┬──────┘
       ▼
┌──────────────┐     ┌────────────────┐
│  Messages    │────▶│  Claude API     │
│  (history)   │     │  (Messages API) │
└──────────────┘     └───────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │  Response        │
                    │  stop_reason?    │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
        stop_reason =              stop_reason =
        "end_turn"                 "tool_use"
                │                         │
                ▼                         ▼
        ┌──────────┐            ┌──────────────────┐
        │ Show to  │            │ Permission Check  │
        │ User     │            └────────┬─────────┘
        └──────────┘                     ▼
                                ┌──────────────────┐
                                │ Execute Tool      │
                                └────────┬─────────┘
                                         ▼
                                ┌──────────────────┐
                                │ Append tool_result│
                                │ to messages       │
                                └────────┬─────────┘
                                         │
                                         └──▶ (back to Claude API)
```

## Tool System Design

```
Tool Interface:
  name: string
  description: string
  inputSchema: ZodSchema
  riskLevel: "read" | "write" | "dangerous"
  execute(input): Promise<string>

Registry:
  register(tool: Tool): void
  get(name: string): Tool | undefined
  listForAPI(): ToolDefinition[]  // format for Claude API
```

## Permission Model

| Risk Level | Behavior | Examples |
|------------|----------|---------|
| `read` | Auto-allow | read_file, glob, grep |
| `write` | Confirm once per session | write_file, edit_file |
| `dangerous` | Confirm every time | run_command |
| `blocked` | Always reject | rm -rf /, format disk |

## Context Management Strategy

1. **Token counting** before each API call
2. **Sliding window** — keep recent messages, summarize old ones
3. **Tool result truncation** — large file contents get trimmed
4. **Compaction** — when approaching limit, compress history

## Model Selection for Development

| Model | Use Case | Cost |
|-------|----------|------|
| `claude-haiku-4-5` | Development & testing (fast, cheap) | ~$0.25/1M input |
| `claude-sonnet-4-6` | Production agent (best coding) | ~$3/1M input |
| `claude-opus-4-6` | Complex reasoning tasks | ~$15/1M input |

We'll use **Haiku** during development to save costs, then switch to **Sonnet** for production.

## Prerequisites

1. **Anthropic API Key** — get from https://platform.claude.com/settings/keys
2. **Node.js 20+** — `node --version` to check
3. **Basic TypeScript knowledge** — we'll learn as we go
