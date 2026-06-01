import type { AgentRun, AgentRunEvent } from "../../src/domain/knowledge.js";
import type { AgentRunRepository } from "../../src/repositories/agentRun.repository.js";

export class InMemoryAgentRunRepository implements AgentRunRepository {
  readonly agentRuns: AgentRun[] = [];
  readonly events: AgentRunEvent[] = [];

  async enqueue(input: { userId?: string | null; runType: string; input: unknown }): Promise<AgentRun> {
    return this.createRun({ ...input, status: "queued", startedAt: null });
  }

  async create(input: { userId?: string | null; runType: string; input: unknown }): Promise<AgentRun> {
    return this.createRun({
      ...input,
      status: "running",
      startedAt: new Date("2026-05-25T00:00:00.000Z"),
    });
  }

  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<AgentRun> {
    const agentRun = this.requiredRun(id);
    agentRun.metadata = { ...agentRun.metadata, ...metadata };
    return agentRun;
  }

  private createRun(input: {
    userId?: string | null;
    runType: string;
    input: unknown;
    status: string;
    startedAt: Date | null;
  }) {
    const agentRun: AgentRun = {
      id: `agent-run-${this.agentRuns.length + 1}`,
      userId: input.userId ?? null,
      runType: input.runType,
      status: input.status,
      input: input.input,
      output: {},
      error: null,
      metadata: {},
      startedAt: input.startedAt,
      completedAt: null,
      createdAt: new Date("2026-05-25T00:00:00.000Z"),
    };
    this.agentRuns.push(agentRun);
    return agentRun;
  }

  async addEvent(input: {
    agentRunId: string;
    eventType: string;
    payload: unknown;
  }): Promise<AgentRunEvent> {
    const event: AgentRunEvent = {
      id: `agent-run-event-${this.events.length + 1}`,
      agentRunId: input.agentRunId,
      eventType: input.eventType,
      payload: input.payload,
      createdAt: new Date("2026-05-25T00:00:00.000Z"),
    };
    this.events.push(event);
    return event;
  }

  async start(id: string): Promise<AgentRun> {
    const agentRun = this.requiredRun(id);
    agentRun.status = "running";
    agentRun.startedAt = new Date("2026-05-25T00:00:00.000Z");
    return agentRun;
  }

  async complete(id: string, output: unknown): Promise<AgentRun> {
    const agentRun = this.requiredRun(id);
    agentRun.status = "completed";
    agentRun.output = output;
    agentRun.completedAt = new Date("2026-05-25T00:00:00.000Z");
    return agentRun;
  }

  async fail(id: string, error: string): Promise<AgentRun> {
    const agentRun = this.requiredRun(id);
    agentRun.status = "failed";
    agentRun.error = error;
    agentRun.completedAt = new Date("2026-05-25T00:00:00.000Z");
    return agentRun;
  }

  async getById(id: string): Promise<AgentRun | null> {
    return this.agentRuns.find((agentRun) => agentRun.id === id) ?? null;
  }

  async listRecent(limit: number): Promise<AgentRun[]> {
    return this.agentRuns.slice(-limit).reverse();
  }

  async listByRawNote(rawNoteId: string): Promise<AgentRun[]> {
    return this.agentRuns.filter((agentRun) => {
      const input = agentRun.input && typeof agentRun.input === "object"
        ? (agentRun.input as Record<string, unknown>)
        : {};
      return input.rawNoteId === rawNoteId;
    });
  }

  async listEvents(agentRunId: string): Promise<AgentRunEvent[]> {
    return this.events.filter((event) => event.agentRunId === agentRunId);
  }

  private requiredRun(id: string) {
    const agentRun = this.agentRuns.find((item) => item.id === id);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }
    return agentRun;
  }
}
