# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Angel Agent is a learning project that builds a Claude Code-like AI agent from scratch. It follows a phased approach (see `LEARNING_PLAN.md`) progressing from a basic chat REPL to a full-featured coding agent with tools, permissions, context management, and sub-agents.

## Build & Run Commands

```bash
npm run dev        # Run src/index.ts (currently starts basic chat REPL)
npm run chat       # Run Phase 1.1: basic chat loop (no tools)
npm run agent      # Run Phase 2: agent loop with tools + permissions
npm run context-agent  # Run Phase 3: agent loop with dynamic context management
npm run build      # TypeScript compilation (tsc) → dist/
npm run test       # Run tests with Vitest
```

Single test: `npx vitest run <path>` or `npx vitest <pattern>`

## Environment Setup

Copy `env.example` to `.env`. Supports two auth modes:
- **Direct API**: set `ANTHROPIC_API_KEY`
- **Proxy/gateway**: set `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`

The `@anthropic-ai/sdk` client auto-reads these env vars.

## Architecture

The project implements the **ReAct pattern** (Reasoning + Acting):

```
User Input → Append to messages[] → Claude API (system + messages + tools)
    ↑                                          ↓
    │                                   stop_reason?
    │                          ┌────────────┴────────────┐
    │                    "end_turn"                  "tool_use"
    │                          ↓                         ↓
    └── wait for input ← Show text          Execute tools → append tool_result → loop back
```

### Core Files

- `src/core/types.ts` — Shared types re-exported from `@anthropic-ai/sdk`, plus `AgentConfig` with defaults (model: `claude-sonnet-4-6`, maxTokens: 4096)
- `src/core/agent-loop.ts` — Phase 1.1: stateless chat REPL. Manages `messages[]` array, calls Messages API, extracts text blocks
- `src/core/agent-loop-with-tools.ts` — Phase 2: adds tool definitions, implements the tool execution loop with registry + permissions
- `src/core/agent-loop-with-context.ts` — Phase 3: adds dynamic system prompt (project detection, CLAUDE.md injection, git awareness) and context window management (token estimation, two-level compaction)
- `src/context/types.ts` — Context types (ProjectContext, SystemPromptConfig, TokenBudget)
- `src/context/project.ts` — Project detection (CLAUDE.md, package.json, git status)
- `src/context/system-prompt.ts` — Dynamic system prompt builder (5 modules: identity, tools, style, safety, project)
- `src/context/manager.ts` — Context window manager (token estimation, tool result compaction, message dropping)
- `src/index.ts` — Entry point, currently imports agent-loop

### Key Design Decisions

- **ES Modules** (`"type": "module"` in package.json) — all imports use `.js` extensions
- **tsx for dev** — runs TypeScript directly, no build step needed during development
- **Conversation state is a `messages[]` array** — the full history is sent with every API call (Claude is stateless)
- **Tool results are sent as `role: "user"` messages** — this is the Claude API protocol for tool_result blocks
- **Files are truncated at 10,000 chars** — context window protection in `read_file` tool

### Planned Structure (from LEARNING_PLAN.md)

```
src/
├── core/           # Agent loop, message handling, types
├── tools/          # Tool registry + individual tool implementations
├── context/        # System prompt builder, context window manager
├── permissions/    # Risk classification, user confirmation
├── agents/         # Sub-agent spawning, multi-agent coordination
├── memory/         # Session persistence, cross-session memory
└── ui/             # Terminal rendering, spinners, markdown
```

## Tech Stack

- **TypeScript** on **Node.js 20+** with ES2022 target
- **@anthropic-ai/sdk** — official Claude SDK (handles auth, streaming, retries, types)
- **Vitest** for testing
- **tsx** for development runtime
- **Zod** for tool input validation

## Learning Materials

The `learn/` directory contains Chinese-language tutorials explaining each phase (phase-1, phase-2, phase-3). These are reference docs, not executable code.
