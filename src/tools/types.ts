import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

export type RiskLevel = "read" | "write" | "dangerous";

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  apiSchema: Anthropic.Tool["input_schema"];
  riskLevel: RiskLevel;
  execute(input: unknown): Promise<string>;
}
