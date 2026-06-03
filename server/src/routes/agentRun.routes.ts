import { Router } from "express";
import { AgentRunController } from "../controllers/agentRun.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { ExtractionEvalRepository } from "../repositories/extractionEval.repository.js";
import type { AgentRunQueueService } from "../services/agentRunQueue.service.js";
import type { PhaseOneWorkflowService } from "../services/phaseOneWorkflow.service.js";
import { enqueueAgentRunSchema, ingestRawNoteSchema } from "../validators/agentRun.schemas.js";

export function createAgentRunRoutes(
  phaseOneWorkflowService: PhaseOneWorkflowService,
  agentRunRepository: AgentRunRepository,
  agentRunQueueService: AgentRunQueueService,
  extractionEvalRepository: ExtractionEvalRepository,
) {
  const router = Router();
  const controller = new AgentRunController(
    phaseOneWorkflowService,
    agentRunRepository,
    agentRunQueueService,
    extractionEvalRepository,
  );

  router.get("/", controller.list);
  router.get("/stream", controller.stream);
  router.post("/", validateBody(enqueueAgentRunSchema), controller.enqueue);
  router.post("/note-ingestion", validateBody(ingestRawNoteSchema), controller.ingestRawNote);
  router.post("/:id/retry", controller.retry);
  router.get("/:id/eval-result", controller.evalResult);
  router.get("/:id", controller.get);

  return router;
}
