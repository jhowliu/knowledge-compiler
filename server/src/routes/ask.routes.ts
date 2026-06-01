import { Router } from "express";
import { AskController } from "../controllers/ask.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { AskService } from "../services/ask.service.js";
import { askSchema } from "../validators/ask.schemas.js";

export function createAskRoutes(askService: AskService) {
  const router = Router();
  const controller = new AskController(askService);

  router.post("/ask", validateBody(askSchema), controller.ask);

  return router;
}
