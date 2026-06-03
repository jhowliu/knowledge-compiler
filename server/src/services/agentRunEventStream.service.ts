export const agentRunStreamEventNames = [
  "agent-stream.connected",
  "agent-stream.heartbeat",
  "agent-run.queued",
  "agent-run.started",
  "agent-run.event",
  "agent-run.completed",
  "agent-run.failed",
  "agent-run.retry-queued",
] as const;

export type AgentRunStreamEventName = (typeof agentRunStreamEventNames)[number];

export type AgentRunStreamEvent = {
  id: string;
  name: AgentRunStreamEventName;
  payload: unknown;
  createdAt: string;
};

export type AgentRunEventPublisher = {
  publish(name: AgentRunStreamEventName, payload: unknown): AgentRunStreamEvent;
};

type AgentRunEventListener = (event: AgentRunStreamEvent) => void;

export class AgentRunEventStreamService implements AgentRunEventPublisher {
  private listeners = new Set<AgentRunEventListener>();
  private sequence = 0;

  publish(name: AgentRunStreamEventName, payload: unknown) {
    this.sequence += 1;
    const event: AgentRunStreamEvent = {
      id: `${Date.now()}-${this.sequence}`,
      name,
      payload,
      createdAt: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      listener(event);
    }

    return event;
  }

  subscribe(listener: AgentRunEventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export class NoopAgentRunEventPublisher implements AgentRunEventPublisher {
  publish(name: AgentRunStreamEventName, payload: unknown) {
    return {
      id: `${Date.now()}-noop`,
      name,
      payload,
      createdAt: new Date().toISOString(),
    };
  }
}
