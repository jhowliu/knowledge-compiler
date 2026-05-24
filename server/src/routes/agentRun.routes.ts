import { Router } from "express";
import { AgentRunController } from "../controllers/agentRun.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { PhaseOneWorkflowService } from "../services/phaseOneWorkflow.service.js";
import { ingestRawNoteSchema } from "../validators/agentRun.schemas.js";

export function createAgentRunRoutes(
  phaseOneWorkflowService: PhaseOneWorkflowService,
  agentRunRepository: AgentRunRepository,
) {
  const router = Router();
  const controller = new AgentRunController(phaseOneWorkflowService, agentRunRepository);

  router.post("/note-ingestion", validateBody(ingestRawNoteSchema), controller.ingestRawNote);
  router.get("/:id", controller.get);

  return router;
}
