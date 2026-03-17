import type { RiskLevel } from "../tools/types.js";

export function needsConfirmation(riskLevel: RiskLevel): boolean {
  return riskLevel !== "read";
}

export function alwaysConfirm(riskLevel: RiskLevel): boolean {
  return riskLevel === "dangerous";
}
