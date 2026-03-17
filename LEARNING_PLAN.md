# Angel Agent - Build a Claude Code-like Agent from Scratch

## Goal

From zero, build a CLI AI Agent that understands codebases, executes tools, and assists with software engineering tasks — similar to Claude Code.

---

## Phase 1: Foundations (Week 1-2)

### 1.1 Understand the Core Loop

Every AI agent follows the same fundamental loop:

```
User Input -> LLM Reasoning -> Tool Selection -> Tool Execution -> Observation -> LLM Reasoning -> ... -> Final Response
```

**Tasks:**
- [x] Read and understand the ReAct (Reasoning + Acting) paper concept
- [x] Implement a basic REPL (Read-Eval-Print Loop) in TypeScript
- [x] Connect to Claude API with streaming support
- [x] Build the simplest possible chat loop (no tools yet)

**Deliverable:** `src/core/agent-loop.ts` - A working chat REPL that talks to Claude ✅

### 1.2 Tool Use Fundamentals

Claude Code's power comes from tools. Understand how tool use works at the API level.

**Tasks:**
- [x] Learn Claude API's tool_use format (tool definitions, tool_use blocks, tool_result blocks)
- [x] Define 2 simple tools: `read_file` and `list_directory`
- [x] Implement tool dispatch: LLM returns tool_use -> your code executes it -> sends tool_result back
- [x] Handle the multi-turn tool loop (LLM may call multiple tools before responding)

**Deliverable:** `src/tools/` directory with working file-reading tools ✅

---

## Phase 2: Core Tool System (Week 3-4)

### 2.1 Essential Tools

Build the tool set that makes an agent useful for coding:

| Tool | Purpose | Priority |
|------|---------|----------|
| `read_file` | Read file contents | P0 |
| `write_file` | Create new files | P0 |
| `edit_file` | Edit existing files (string replacement) | P0 |
| `run_command` | Execute shell commands | P0 |
| `glob` | Find files by pattern | P1 |
| `grep` | Search file contents | P1 |
| `ask_user` | Ask user for clarification | P1 |

**Tasks:**
- [x] Implement each tool with proper input validation (Zod schemas)
- [x] Build a tool registry system for dynamic tool registration
- [x] Add proper error handling for each tool
- [x] Write unit tests for every tool (43 tests passing)

**Deliverable:** Complete tool system with registry pattern ✅

### 2.2 Permission & Safety System

Claude Code asks for permission before dangerous actions. This is critical.

**Tasks:**
- [x] Classify tools by risk level: read-only vs write vs dangerous
- [x] Build a permission prompt system (auto-allow reads, confirm writes)
- [x] Implement command sandboxing basics (timeout, working directory restrictions)
- [x] Add a blocklist for dangerous commands (rm -rf /, etc.)

**Deliverable:** `src/permissions/` - Permission system with risk classification ✅

---

## Phase 3: Context & Intelligence (Week 5-6)

### 3.1 System Prompt Engineering

The system prompt is what makes an agent behave like a coding assistant vs a chatbot.

**Tasks:**
- [ ] Study how Claude Code's system prompt is structured (role, rules, tool descriptions)
- [ ] Build a dynamic system prompt that includes:
  - Agent identity and capabilities
  - Tool usage instructions
  - Code style guidelines
  - Safety rules
- [ ] Add project context injection (read CLAUDE.md, package.json, etc.)
- [ ] Implement git status awareness

**Deliverable:** `src/context/system-prompt.ts` - Dynamic system prompt builder

### 3.2 Context Window Management

Real projects have more code than fits in a context window.

**Tasks:**
- [ ] Understand token counting and context limits
- [ ] Implement conversation history management (keep, summarize, or drop old messages)
- [ ] Build a simple context compaction strategy (summarize old tool results)
- [ ] Add file content truncation for large files

**Deliverable:** `src/context/manager.ts` - Context window manager

---

## Phase 4: Advanced Agent Patterns (Week 7-8)

### 4.1 Multi-step Reasoning

Agents must plan and execute complex tasks across multiple files.

**Tasks:**
- [ ] Implement plan-then-execute pattern (agent creates a plan, then follows it)
- [ ] Add self-correction: when a tool fails, agent should retry or try alternative
- [ ] Build a task tracking system (agent knows what it has done and what remains)
- [ ] Handle the "agent loop" — prevent infinite loops and detect stuck states

**Deliverable:** Working multi-step task execution

### 4.2 Streaming & UX

Good UX is what separates a tool from a toy.

**Tasks:**
- [ ] Implement streaming token output (show text as it generates)
- [ ] Show tool calls in a structured format (what tool, what args, what result)
- [ ] Add progress indicators for long-running operations
- [ ] Implement Ctrl+C handling for graceful interruption
- [ ] Add colored terminal output (chalk/picocolors)

**Deliverable:** Polished CLI experience with streaming

---

## Phase 5: Production Patterns (Week 9-10)

### 5.1 Sub-agents & Parallel Execution

Claude Code spawns sub-agents for complex tasks. This is a key architecture pattern.

**Tasks:**
- [ ] Implement agent spawning (main agent creates child agents for subtasks)
- [ ] Build a simple message passing system between agents
- [ ] Add parallel tool execution for independent operations
- [ ] Implement agent isolation (each sub-agent has its own context)

**Deliverable:** `src/agents/` - Multi-agent coordination system

### 5.2 Memory & Persistence

**Tasks:**
- [ ] Implement conversation history persistence (save/resume sessions)
- [ ] Build a project memory system (remember key facts across sessions)
- [ ] Add a CLAUDE.md-like configuration file reader
- [ ] Implement caching for expensive operations (file reads, command results)

**Deliverable:** `src/memory/` - Persistence and memory system

---

## Phase 6: Polish & Extend (Week 11-12)

### 6.1 Error Recovery & Robustness

**Tasks:**
- [ ] Handle API rate limits and retries with exponential backoff
- [ ] Graceful degradation when tools fail
- [ ] Add logging system for debugging agent behavior
- [ ] Implement max-turns safety limit

### 6.2 Extension Points

**Tasks:**
- [ ] Plugin system for custom tools
- [ ] Hook system (pre/post tool execution hooks)
- [ ] Custom agent definitions (like .claude/agents/)
- [ ] MCP (Model Context Protocol) server basics

**Deliverable:** Extensible agent framework

---

## Project Structure

```
angel-agent/
├── src/
│   ├── core/
│   │   ├── agent-loop.ts       # Main agent loop (ReAct pattern)
│   │   ├── message-handler.ts  # Process LLM responses
│   │   └── types.ts            # Core type definitions
│   ├── tools/
│   │   ├── registry.ts         # Tool registration & dispatch
│   │   ├── read-file.ts
│   │   ├── write-file.ts
│   │   ├── edit-file.ts
│   │   ├── run-command.ts
│   │   ├── glob.ts
│   │   └── grep.ts
│   ├── context/
│   │   ├── system-prompt.ts    # Dynamic prompt builder
│   │   ├── manager.ts          # Context window management
│   │   └── project.ts          # Project detection & config
│   ├── permissions/
│   │   ├── classifier.ts       # Risk level classification
│   │   └── prompt.ts           # User confirmation UI
│   ├── agents/
│   │   ├── spawner.ts          # Sub-agent creation
│   │   └── coordinator.ts      # Multi-agent coordination
│   ├── memory/
│   │   ├── session.ts          # Conversation persistence
│   │   └── project.ts          # Cross-session memory
│   ├── ui/
│   │   ├── terminal.ts         # Terminal rendering
│   │   ├── spinner.ts          # Progress indicators
│   │   └── markdown.ts         # Markdown rendering in terminal
│   └── index.ts                # CLI entry point
├── tests/
├── package.json
├── tsconfig.json
└── LEARNING_PLAN.md
```

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Language | TypeScript | Type safety, Claude Code is built with TS |
| Runtime | Node.js | Best ecosystem for CLI tools |
| AI SDK | @anthropic-ai/sdk | Official Claude SDK |
| CLI Framework | Commander.js or none | Keep it simple |
| Schema Validation | Zod | Tool input validation |
| Terminal UI | chalk + ora | Colored output + spinners |
| Testing | Vitest | Fast, TS-native |
| Build | tsup or tsx | Simple TS compilation |

---

## Key Concepts to Master

### 1. ReAct Pattern (Reasoning + Acting)
The agent alternates between thinking (reasoning about what to do) and acting (calling tools). This is the fundamental pattern behind every coding agent.

### 2. Tool Use Protocol
```
User: "Read the package.json file"
        ↓
LLM Response: { type: "tool_use", name: "read_file", input: { path: "package.json" } }
        ↓
Your Code: executes the tool, gets file content
        ↓
Tool Result: { type: "tool_result", content: "{ \"name\": \"my-app\" ... }" }
        ↓
LLM Response: "The package.json shows this is a project called my-app..."
```

### 3. System Prompt = Agent Personality
The system prompt defines:
- What the agent can and cannot do
- How it should use tools
- Safety boundaries
- Output format preferences

### 4. Context Window as Working Memory
The context window IS the agent's brain. Managing what goes in and what gets dropped is the core challenge of building reliable agents.

### 5. Permission Model
Trust levels for tools:
- **Auto-allow**: read_file, glob, grep (read-only)
- **Confirm once**: write_file, edit_file (modifications)
- **Always confirm**: run_command (arbitrary execution)
- **Block**: destructive system commands

---

## Learning Resources

1. **Anthropic Docs** - Tool Use: https://docs.anthropic.com/en/docs/tool-use
2. **Anthropic Docs** - Claude Agent SDK: https://docs.anthropic.com/en/docs/agents
3. **Building Effective Agents** (Anthropic blog): Key patterns and anti-patterns
4. **Model Context Protocol (MCP)**: https://modelcontextprotocol.io
5. **ReAct Paper**: "ReAct: Synergizing Reasoning and Acting in Language Models"

---

## How to Use This Plan

1. **Start with Phase 1** - Get the basic loop working first
2. **Each phase builds on the previous** - Don't skip ahead
3. **Write tests as you go** - Use TDD for tool implementations
4. **Keep it simple** - Start with the minimum viable version, then iterate
5. **Compare with Claude Code** - After each phase, compare your implementation with how Claude Code works

Ready to start? Begin with Phase 1.1 — let's build the core agent loop.
