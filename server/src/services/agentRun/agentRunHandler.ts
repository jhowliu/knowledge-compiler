import type { AgentRun } from "../../domain/knowledge.js";

export interface AgentRunHandler<TOutput = unknown> {
  readonly runType: string;
  validateInput?(input: Record<string, unknown>): void;
  run(agentRun: AgentRun): Promise<TOutput>;
}
