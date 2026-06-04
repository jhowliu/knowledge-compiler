import { agentRunEvents } from "../domain/agentRunEvents.js";
import { AppError } from "../domain/errors.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { AgentRunHandler } from "./agentRun/agentRunHandler.js";
export type { CompileAgentRunnerContext, CompileAgentRunnerFactory } from "./agentRun/compileRunner.types.js";

export class AgentRunQueueService {
  private readonly handlers: Map<string, AgentRunHandler>;

  constructor(
    private readonly agentRunRepository: AgentRunRepository,
    handlers: AgentRunHandler[],
  ) {
    this.handlers = new Map(handlers.map((handler) => [handler.runType, handler]));
  }

  async enqueue(input: { userId?: string | null; runType: string; input?: unknown }) {
    const handler = this.handlers.get(input.runType);
    if (!handler) {
      throw new Error("Unsupported agent run type");
    }
    const runInput = input.input && typeof input.input === "object" ? (input.input as Record<string, unknown>) : {};
    handler.validateInput?.(runInput);

    const agentRun = await this.agentRunRepository.enqueue({
      userId: input.userId,
      runType: input.runType,
      input: runInput,
    });
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      ...agentRunEvents.lifecycle.queued,
      payload: { runType: input.runType },
    });

    return agentRun;
  }

  async retry(agentRunId: string) {
    const originalRun = await this.agentRunRepository.getById(agentRunId);
    if (!originalRun) {
      throw new AppError("Agent run not found", 404);
    }
    if (originalRun.status !== "failed") {
      throw new AppError("Only failed agent runs can be retried", 400);
    }

    const originalInput =
      originalRun.input && typeof originalRun.input === "object"
        ? (originalRun.input as Record<string, unknown>)
        : {};
    const retryRun = await this.enqueue({
      userId: originalRun.userId,
      runType: originalRun.runType,
      input: {
        ...originalInput,
        retryOfAgentRunId: originalRun.id,
      },
    });
    await this.agentRunRepository.addEvent({
      agentRunId: originalRun.id,
      ...agentRunEvents.lifecycle.retryQueued,
      payload: { retryAgentRunId: retryRun.id },
    });
    await this.agentRunRepository.addEvent({
      agentRunId: retryRun.id,
      ...agentRunEvents.lifecycle.retryOf,
      payload: { originalAgentRunId: originalRun.id },
    });

    return retryRun;
  }

  async process(agentRunId: string) {
    const agentRun = await this.agentRunRepository.getById(agentRunId);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }
    const handler = this.handlers.get(agentRun.runType);
    if (!handler) {
      throw new Error(`Unsupported agent run type: ${agentRun.runType}`);
    }

    await this.agentRunRepository.start(agentRun.id);
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      ...agentRunEvents.lifecycle.started,
      payload: { runType: agentRun.runType },
    });

    try {
      const output = await handler.run(agentRun);
      await this.agentRunRepository.complete(agentRun.id, output);
      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.lifecycle.completed,
        payload: output,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent run error";
      await this.agentRunRepository.fail(agentRun.id, message);
      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.lifecycle.failed,
        payload: { error: message },
      });
      throw error;
    }
  }
}
