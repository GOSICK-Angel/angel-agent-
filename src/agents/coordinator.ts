import type Anthropic from "@anthropic-ai/sdk";
import type { ToolRegistry } from "../tools/registry.js";
import type { PermissionManager } from "../permissions/manager.js";
import type {
  SubAgentConfig,
  SubAgent,
  AgentMessage,
  AgentStatus,
  SpawnResult,
} from "./types.js";
import { createSubAgent, runSubAgent } from "./sub-agent.js";

export class AgentCoordinator {
  private agents = new Map<string, SubAgent>();
  private messageLog: AgentMessage[] = [];

  spawn(config: SubAgentConfig): SpawnResult {
    try {
      const agent = createSubAgent(config);
      this.agents.set(agent.id, agent);
      return { success: true, agentId: agent.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, agentId: "", error: message };
    }
  }

  async runAgent(
    agentId: string,
    client: Anthropic,
    registry: ToolRegistry,
    permissionManager: PermissionManager,
    systemPrompt: string
  ): Promise<SubAgent> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (agent.status !== "idle") {
      throw new Error(`Agent "${agent.config.name}" is not idle (status: ${agent.status})`);
    }

    const completedAgent = await runSubAgent(
      agent,
      client,
      registry,
      permissionManager,
      systemPrompt
    );

    this.agents.set(agentId, completedAgent);
    return completedAgent;
  }

  sendMessage(fromId: string, toId: string, content: string): AgentMessage {
    const message: AgentMessage = {
      fromAgentId: fromId,
      toAgentId: toId,
      content,
      timestamp: Date.now(),
    };
    this.messageLog = [...this.messageLog, message];
    return message;
  }

  getMessages(agentId: string): readonly AgentMessage[] {
    return this.messageLog.filter(
      (m) => m.fromAgentId === agentId || m.toAgentId === agentId
    );
  }

  getAgent(id: string): SubAgent | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): SubAgent[] {
    return Array.from(this.agents.values());
  }

  getAgentsByStatus(status: AgentStatus): SubAgent[] {
    return this.getAllAgents().filter((a) => a.status === status);
  }
}
