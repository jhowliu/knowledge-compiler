import type { Response } from "express";
import type { AgentRunEvent } from "../domain/knowledge.js";

type StreamClient = {
  id: number;
  response: Response;
};

class AgentRunEventStreamService {
  private nextClientId = 1;
  private readonly clients = new Map<number, StreamClient>();

  connect(response: Response) {
    const clientId = this.nextClientId;
    this.nextClientId += 1;

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    response.write("event: agent-stream.connected\n");
    response.write(`data: ${JSON.stringify({ connected: true })}\n\n`);

    const client = { id: clientId, response };
    this.clients.set(clientId, client);
    const heartbeat = setInterval(() => {
      response.write(": ping\n\n");
    }, 30_000);

    response.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(clientId);
    });
  }

  publishAgentRunEvent(event: AgentRunEvent) {
    this.broadcast("agent-run.event", {
      agentRunId: event.agentRunId,
      event,
    });
  }

  private broadcast(eventName: string, payload: unknown) {
    const data = JSON.stringify(payload);
    for (const client of this.clients.values()) {
      client.response.write(`event: ${eventName}\n`);
      client.response.write(`data: ${data}\n\n`);
    }
  }
}

export const agentRunEventStreamService = new AgentRunEventStreamService();
