import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.js";
import type { DashboardService } from "../services/dashboard.service.js";

export function createDashboardRoutes(dashboardService: DashboardService) {
  const router = Router();
  const controller = new DashboardController(dashboardService);

  router.get("/compiled-notes", controller.compiledNotes);
  router.get("/search", controller.search);
  router.get("/knowledge-sources/:id/timeline", controller.knowledgeSourceTimeline);
  router.get("/compiled-notes/:id/timeline", controller.compiledNoteTimeline);

  return router;
}
