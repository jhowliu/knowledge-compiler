import { Router } from "express";
import { RawNoteController } from "../controllers/rawNote.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { RawNoteService } from "../services/rawNote.service.js";
import { createRawNoteSchema, updateRawNoteSchema } from "../validators/rawNote.schemas.js";

export function createRawNoteRoutes(rawNoteService: RawNoteService) {
  const router = Router();
  const controller = new RawNoteController(rawNoteService);

  router.get("/", controller.list);
  router.post("/", validateBody(createRawNoteSchema), controller.create);
  router.patch("/:id", validateBody(updateRawNoteSchema), controller.update);
  router.delete("/:id", controller.delete);
  router.get("/:id/indexing-trace", controller.indexingTrace);
  router.post("/:id/compile", controller.compile);

  return router;
}
