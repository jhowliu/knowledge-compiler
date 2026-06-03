import type { NextFunction, Request, Response } from "express";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { ExtractionEvalRepository } from "../repositories/extractionEval.repository.js";
import type { AgentRunQueueService } from "../services/agentRunQueue.service.js";
import type {
  AgentRunEventStreamService,
  AgentRunStreamEvent,
} from "../services/agentRunEventStream.service.js";
import type { PhaseOneWorkflowService } from "../services/phaseOneWorkflow.service.js";
import { requireStringParam } from "./requestParams.js";

export class AgentRunController {
  constructor(
    private readonly phaseOneWorkflowService: PhaseOneWorkflowService,
    private readonly agentRunRepository: AgentRunRepository,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly extractionEvalRepository: ExtractionEvalRepository,
    private readonly agentRunEventStreamService: AgentRunEventStreamService,
  ) {}

  list = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ agentRuns: await this.agentRunRepository.listRecent(12) });
    } catch (error) {
      next(error);
    }
  };

  enqueue = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const agentRun = await this.agentRunQueueService.enqueue(request.body);
      this.processSoon(agentRun.id);
      response.status(202).json({ agentRun });
    } catch (error) {
      next(error);
    }
  };

  retry = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const agentRun = await this.agentRunQueueService.retry(requireStringParam(request, "id"));
      this.processSoon(agentRun.id);
      response.status(202).json({ agentRun });
    } catch (error) {
      next(error);
    }
  };

  ingestRawNote = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await this.phaseOneWorkflowService.ingestRawNote(request.body.rawNoteId);
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  get = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const id = requireStringParam(request, "id");
      const agentRun = await this.agentRunRepository.getById(id);
      const events = await this.agentRunRepository.listEvents(id);
      response.json({ agentRun, events });
    } catch (error) {
      next(error);
    }
  };

  evalResult = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const id = requireStringParam(request, "id");
      response.json({
        extractionEval: await this.extractionEvalRepository.getByAgentRunId(id),
      });
    } catch (error) {
      next(error);
    }
  };

  stream = async (request: Request, response: Response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    const writeEvent = (event: AgentRunStreamEvent) => {
      response.write(`id: ${event.id}\n`);
      response.write(`event: ${event.name}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    writeEvent({
      id: `connected-${Date.now()}`,
      name: "agent-stream.connected",
      payload: { connectedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
    });

    const unsubscribe = this.agentRunEventStreamService.subscribe(writeEvent);
    const heartbeat = setInterval(() => {
      writeEvent({
        id: `heartbeat-${Date.now()}`,
        name: "agent-stream.heartbeat",
        payload: { now: new Date().toISOString() },
        createdAt: new Date().toISOString(),
      });
    }, 25_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  };

  private processSoon(agentRunId: string) {
    setTimeout(() => {
      this.agentRunQueueService.process(agentRunId).catch((error) => {
        console.error("agent run failed", error);
      });
    }, 0);
  }
}
