import type { TaskPlan, TaskStep, StepStatus } from "./types.js";

export function createPlan(goal: string, descriptions: string[]): TaskPlan {
  return {
    goal,
    steps: descriptions.map((desc, i) => ({
      id: i + 1,
      description: desc,
      status: "pending" as StepStatus,
    })),
    createdAt: Date.now(),
  };
}

export function updateStep(
  plan: TaskPlan,
  stepId: number,
  status: StepStatus,
  error?: string
): TaskPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.id === stepId
        ? { ...step, status, ...(error !== undefined ? { error } : {}) }
        : step
    ),
  };
}

export function startStep(plan: TaskPlan, stepId: number): TaskPlan {
  return updateStep(plan, stepId, "in_progress");
}

export function completeStep(plan: TaskPlan, stepId: number): TaskPlan {
  return updateStep(plan, stepId, "completed");
}

export function failStep(plan: TaskPlan, stepId: number, error: string): TaskPlan {
  return updateStep(plan, stepId, "failed", error);
}

export function skipStep(plan: TaskPlan, stepId: number): TaskPlan {
  return updateStep(plan, stepId, "skipped");
}

export interface PlanProgress {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly skipped: number;
}

export function getProgress(plan: TaskPlan): PlanProgress {
  const counts: PlanProgress = {
    total: plan.steps.length,
    completed: 0,
    failed: 0,
    pending: 0,
    inProgress: 0,
    skipped: 0,
  };

  return plan.steps.reduce(
    (acc, step) => ({
      ...acc,
      [step.status === "in_progress" ? "inProgress" : step.status]:
        acc[step.status === "in_progress" ? "inProgress" : step.status] + 1,
    }),
    counts
  );
}

export function formatProgress(plan: TaskPlan): string {
  const progress = getProgress(plan);
  const done = progress.completed + progress.skipped;
  return `[Plan: ${done}/${progress.total} steps complete]`;
}

export function formatPlanSummary(plan: TaskPlan): string {
  const lines: string[] = [`Plan: ${plan.goal}`];
  for (const step of plan.steps) {
    const icon =
      step.status === "completed" ? "✓" :
      step.status === "failed" ? "✗" :
      step.status === "in_progress" ? "→" :
      step.status === "skipped" ? "–" :
      " ";
    lines.push(`  ${icon} ${step.id}. ${step.description}`);
  }
  return lines.join("\n");
}

export function parsePlanFromText(text: string): { goal: string; steps: string[] } | null {
  const planMatch = text.match(/##\s*Plan[:\s]*(.+?)(?:\n|$)/i);
  if (!planMatch) {
    return null;
  }

  const goal = planMatch[1].trim();
  const afterPlan = text.slice(text.indexOf(planMatch[0]) + planMatch[0].length);
  const stepPattern = /^\s*\d+[\.\)]\s+(.+)$/gm;
  const steps: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = stepPattern.exec(afterPlan)) !== null) {
    steps.push(match[1].trim());
  }

  return steps.length > 0 ? { goal, steps } : null;
}
