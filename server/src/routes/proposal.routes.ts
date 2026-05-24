import { Router } from "express";
import { ProposalController } from "../controllers/proposal.controller.js";
import type { ProposalService } from "../services/proposal.service.js";

export function createProposalRoutes(proposalService: ProposalService) {
  const router = Router();
  const controller = new ProposalController(proposalService);

  router.get("/", controller.list);
  router.get("/:id", controller.get);
  router.post("/:id/approve", controller.approve);
  router.post("/:id/reject", controller.reject);

  return router;
}
