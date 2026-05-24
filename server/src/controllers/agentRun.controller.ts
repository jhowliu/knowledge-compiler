import type { NextFunction, Request, Response } from "express";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { PhaseOneWorkflowService } from "../services/phaseOneWorkflow.service.js";
import { requireStringParam } from "./requestParams.js";

export class AgentRunController {
  constructor(
    private readonly phaseOneWorkflowService: PhaseOneWorkflowService,
    private readonly agentRunRepository: AgentRunRepository,
  ) {}

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
}
