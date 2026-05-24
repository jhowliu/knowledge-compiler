import { Router } from "express";
import { NoteLinkController } from "../controllers/noteLink.controller.js";
import { validateBody } from "../middleware/validateRequest.js";
import type { NoteLinkService } from "../services/noteLink.service.js";
import { createNoteLinkSchema, updateNoteLinkSchema } from "../validators/noteLink.schemas.js";

export function createNoteLinkRoutes(noteLinkService: NoteLinkService) {
  const router = Router();
  const controller = new NoteLinkController(noteLinkService);

  router.get("/", controller.graph);
  router.post("/", validateBody(createNoteLinkSchema), controller.create);
  router.get("/notes/:noteId", controller.forNote);
  router.patch("/:id", validateBody(updateNoteLinkSchema), controller.update);
  router.delete("/:id", controller.archive);
  router.post("/:id/approve", controller.approve);
  router.post("/:id/reject", controller.reject);

  return router;
}
