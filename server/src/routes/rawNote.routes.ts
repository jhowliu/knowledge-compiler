import { Router } from "express";
import { RawNoteController } from "../controllers/rawNote.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { RawNoteService } from "../services/rawNote.service.js";
import { createRawNoteSchema } from "../validators/rawNote.schemas.js";

export function createRawNoteRoutes(rawNoteService: RawNoteService) {
  const router = Router();
  const controller = new RawNoteController(rawNoteService);

  router.get("/", controller.list);
  router.post("/", validateBody(createRawNoteSchema), controller.create);

  return router;
}
