# Phase 4.1: Multi-Step Reasoning

## Overview

Phase 4 introduces **multi-step reasoning** — the agent can now create plans for complex tasks, track progress through each step, and self-correct when things go wrong. Additionally, a **loop guard** prevents the agent from getting stuck in infinite loops.

## Key Concepts

### 1. Task Tracker (Plan-Execute Pattern)

The agent follows a **Plan-Execute** pattern:
1. When asked a complex task, the agent creates a numbered plan
2. The code parses `## Plan` sections from the agent's output
3. Each step is tracked with a status: `pending → in_progress → completed/failed/skipped`
4. Progress is shown to the user: `[Plan: 3/5 steps complete]`

```typescript
// src/reasoning/types.ts
export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export interface TaskStep {
  readonly id: number;
  readonly description: string;
  readonly status: StepStatus;
  readonly error?: string;
}

export interface TaskPlan {
  readonly goal: string;
  readonly steps: readonly TaskStep[];
  readonly createdAt: number;
}
```

**Immutability is key** — every operation returns a new plan object, never mutating the original:

```typescript
export function completeStep(plan: TaskPlan, stepId: number): TaskPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.id === stepId ? { ...step, status: "completed" } : step
    ),
  };
}
```

### 2. Plan Parsing

The system prompt instructs the agent to create plans using a specific format:

```markdown
## Plan: Build authentication system
1. Create user model with email/password fields
2. Add login endpoint with JWT tokens
3. Write unit tests for auth flow
```

The code detects this format and automatically creates a `TaskPlan`:

```typescript
export function parsePlanFromText(text: string): { goal: string; steps: string[] } | null {
  const planMatch = text.match(/##\s*Plan[:\s]*(.+?)(?:\n|$)/i);
  // ... extract numbered steps
}
```

### 3. Loop Guard (Circuit Breaker)

The `LoopGuard` class prevents three types of infinite loops:

| Guard | Threshold | Action |
|-------|-----------|--------|
| Consecutive errors | 3 | Inject hint: "try different approach" |
| Total tool calls | 50 | Hard stop |
| Identical calls | 3× same (tool, input) | Flag as stuck |

```typescript
export class LoopGuard {
  recordCall(name: string, input: Record<string, unknown>): LoopGuardResult {
    this.totalCalls++;
    // Check total calls limit
    // Check repetition limit
    return { stop: boolean, reason: string };
  }

  recordError(): LoopGuardResult {
    this.consecutiveErrors++;
    // Warn after threshold
  }

  recordSuccess(): void {
    this.consecutiveErrors = 0; // Reset on success
  }
}
```

The loop guard is a **code-enforced** safety mechanism, not relying on the model to self-regulate.

### 4. Self-Correction via System Prompt

The system prompt now includes planning instructions that teach the agent to:
- Create structured plans for complex tasks
- Analyze errors before retrying
- Never repeat the exact same failing action
- Ask for help when stuck

```typescript
function buildPlanningInstructions(): string {
  return [
    "## Multi-Step Reasoning",
    "For complex tasks that require multiple steps:",
    "1. Create a plan using a `## Plan: <goal>` heading followed by numbered steps.",
    "2. Execute each step in order, adjusting as needed.",
    "3. If a step fails, analyze the error and try a different approach.",
    // ...
  ].join("\n");
}
```

## Architecture Diagram

```
User Input
    ↓
Parse Plan? ──yes──→ createPlan() → Track Steps
    │ no                                  │
    ↓                                     ↓
Claude API ←─────── Plan Summary in Context
    ↓
Tool Calls? ──yes──→ LoopGuard.recordCall()
    │ no                    │
    ↓               stop? ──yes──→ Abort + Warn User
Show Text              │ no
    ↓                  ↓
    │           Execute Tool
    │                  │
    │           error? ──yes──→ LoopGuard.recordError()
    │              │ no              │
    │              ↓          warn? ──yes──→ Inject Hint
    │      recordSuccess()         │ no
    │              ↓               ↓
    └──────── advancePlanStep() ───┘
```

## Key Design Decisions

1. **Immutable data structures**: All plan operations return new objects. This prevents bugs from shared mutable state and makes testing straightforward.

2. **Soft vs Hard controls**: Plan tracking is "soft" (agent-driven, prompt-based), while loop guard is "hard" (code-enforced, cannot be bypassed).

3. **Plan in context**: The current plan summary is appended to the system prompt, giving the agent awareness of its own progress.

4. **Graceful degradation**: The loop guard warns before stopping. Consecutive errors produce hints, not hard stops, giving the agent a chance to self-correct.
