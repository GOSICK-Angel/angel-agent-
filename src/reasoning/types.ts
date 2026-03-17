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

export interface LoopGuardConfig {
  readonly maxConsecutiveErrors: number;
  readonly maxTotalCalls: number;
  readonly maxRepetitions: number;
}

export const DEFAULT_LOOP_GUARD_CONFIG: LoopGuardConfig = {
  maxConsecutiveErrors: 3,
  maxTotalCalls: 50,
  maxRepetitions: 3,
};

export interface LoopGuardResult {
  readonly stop: boolean;
  readonly reason: string;
}
