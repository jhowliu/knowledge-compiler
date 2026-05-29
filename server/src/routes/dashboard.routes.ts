import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.js";
import type { DashboardService } from "../services/dashboard.service.js";

export function createDashboardRoutes(dashboardService: DashboardService) {
  const router = Router();
  const controller = new DashboardController(dashboardService);

  router.get("/compiled-notes", controller.compiledNotes);
  router.get("/review-maps", controller.reviewMaps);
  router.get("/mistakes", controller.mistakes);
  router.get("/review-tasks", controller.reviewTasks);
  router.post("/review-tasks/:id/complete", controller.completeReviewTask);
  router.get("/readiness-map", controller.readinessMap);
  router.get("/search", controller.search);
  router.get("/knowledge-sources/:id/timeline", controller.knowledgeSourceTimeline);
  router.get("/compiled-notes/:id/timeline", controller.compiledNoteTimeline);

  return router;
}
