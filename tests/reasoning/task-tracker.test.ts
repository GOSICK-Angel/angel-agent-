import { describe, it, expect } from "vitest";
import {
  createPlan,
  startStep,
  completeStep,
  failStep,
  skipStep,
  getProgress,
  formatProgress,
  formatPlanSummary,
  parsePlanFromText,
} from "../../src/reasoning/task-tracker.js";

describe("createPlan", () => {
  it("should create a plan with pending steps", () => {
    const plan = createPlan("Build feature", ["Step 1", "Step 2", "Step 3"]);

    expect(plan.goal).toBe("Build feature");
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]).toEqual({
      id: 1,
      description: "Step 1",
      status: "pending",
    });
    expect(plan.steps[2].id).toBe(3);
    expect(plan.createdAt).toBeGreaterThan(0);
  });

  it("should handle empty steps", () => {
    const plan = createPlan("Empty plan", []);
    expect(plan.steps).toHaveLength(0);
  });
});

describe("step transitions", () => {
  const plan = createPlan("Test", ["A", "B", "C"]);

  it("should start a step", () => {
    const updated = startStep(plan, 1);
    expect(updated.steps[0].status).toBe("in_progress");
    expect(updated.steps[1].status).toBe("pending");
  });

  it("should complete a step", () => {
    const updated = completeStep(plan, 2);
    expect(updated.steps[1].status).toBe("completed");
  });

  it("should fail a step with error", () => {
    const updated = failStep(plan, 1, "Something broke");
    expect(updated.steps[0].status).toBe("failed");
    expect(updated.steps[0].error).toBe("Something broke");
  });

  it("should skip a step", () => {
    const updated = skipStep(plan, 3);
    expect(updated.steps[2].status).toBe("skipped");
  });
});

describe("immutability", () => {
  it("should not mutate the original plan", () => {
    const plan = createPlan("Test", ["A", "B"]);
    const updated = completeStep(plan, 1);

    expect(plan.steps[0].status).toBe("pending");
    expect(updated.steps[0].status).toBe("completed");
    expect(plan.steps).not.toBe(updated.steps);
  });
});

describe("getProgress", () => {
  it("should count step statuses", () => {
    let plan = createPlan("Test", ["A", "B", "C", "D", "E"]);
    plan = completeStep(plan, 1);
    plan = completeStep(plan, 2);
    plan = failStep(plan, 3, "err");
    plan = startStep(plan, 4);

    const progress = getProgress(plan);
    expect(progress.total).toBe(5);
    expect(progress.completed).toBe(2);
    expect(progress.failed).toBe(1);
    expect(progress.inProgress).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.skipped).toBe(0);
  });
});

describe("formatProgress", () => {
  it("should format progress string", () => {
    let plan = createPlan("Test", ["A", "B", "C", "D", "E"]);
    plan = completeStep(plan, 1);
    plan = completeStep(plan, 2);
    plan = skipStep(plan, 3);

    expect(formatProgress(plan)).toBe("[Plan: 3/5 steps complete]");
  });
});

describe("formatPlanSummary", () => {
  it("should format plan with step icons", () => {
    let plan = createPlan("Build app", ["Design", "Code", "Test"]);
    plan = completeStep(plan, 1);
    plan = startStep(plan, 2);

    const summary = formatPlanSummary(plan);
    expect(summary).toContain("Build app");
    expect(summary).toContain("✓ 1. Design");
    expect(summary).toContain("→ 2. Code");
    expect(summary).toContain("  3. Test");
  });
});

describe("parsePlanFromText", () => {
  it("should parse plan from markdown text", () => {
    const text = `## Plan: Build authentication
1. Create user model
2. Add login endpoint
3. Write tests`;

    const result = parsePlanFromText(text);
    expect(result).not.toBeNull();
    expect(result!.goal).toBe("Build authentication");
    expect(result!.steps).toEqual([
      "Create user model",
      "Add login endpoint",
      "Write tests",
    ]);
  });

  it("should return null for text without plan", () => {
    const result = parsePlanFromText("Just some regular text");
    expect(result).toBeNull();
  });

  it("should return null for plan header with no steps", () => {
    const result = parsePlanFromText("## Plan: Empty\nNo steps here");
    expect(result).toBeNull();
  });
});
