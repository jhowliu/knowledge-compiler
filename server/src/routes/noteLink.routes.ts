import { Router } from "express";
import { NoteLinkController } from "../controllers/noteLink.controller.js";
import type { NoteLinkService } from "../services/noteLink.service.js";

export function createNoteLinkRoutes(noteLinkService: NoteLinkService) {
  const router = Router();
  const controller = new NoteLinkController(noteLinkService);

  router.get("/", controller.graph);
  router.get("/notes/:noteId", controller.forNote);
  router.post("/:id/approve", controller.approve);
  router.post("/:id/reject", controller.reject);

  return router;
}
