import type { MessageParam } from "../core/types.js";

export interface ProjectContext {
  rootPath: string;
  name: string;
  claudeMd: string | null;
  packageJson: Record<string, unknown> | null;
  gitBranch: string | null;
  gitStatus: string | null;
  hasGit: boolean;
}

export interface SystemPromptConfig {
  agentIdentity: boolean;
  toolInstructions: boolean;
  codeStyleRules: boolean;
  safetyRules: boolean;
  projectContext: boolean;
}

export const DEFAULT_PROMPT_CONFIG: SystemPromptConfig = {
  agentIdentity: true,
  toolInstructions: true,
  codeStyleRules: true,
  safetyRules: true,
  projectContext: true,
};

export interface TokenBudget {
  maxTokens: number;
  reservedForResponse: number;
  reservedForSystem: number;
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  maxTokens: 200000,
  reservedForResponse: 4096,
  reservedForSystem: 4000,
};

export interface CompactionResult {
  messages: MessageParam[];
  removedCount: number;
  estimatedTokensSaved: number;
}
