import { Router } from "express";
import { NoteCardPositionController } from "../controllers/noteCardPosition.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { NoteCardPositionService } from "../services/noteCardPosition.service.js";
import { saveNoteCardPositionSchema } from "../validators/noteCardPosition.schemas.js";

export function createNoteCardPositionRoutes(noteCardPositionService: NoteCardPositionService) {
  const router = Router();
  const controller = new NoteCardPositionController(noteCardPositionService);

  router.get("/", controller.list);
  router.delete("/", controller.reset);
  router.put("/:noteId", validateBody(saveNoteCardPositionSchema), controller.save);

  return router;
}
