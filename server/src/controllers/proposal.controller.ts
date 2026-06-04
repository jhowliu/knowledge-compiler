import type { NextFunction, Request, Response } from "express";
import type { ProposalService } from "../services/proposal.service.js";
import { requireStringParam } from "./requestParams.js";

export class ProposalController {
  constructor(private readonly proposalService: ProposalService) {}

  list = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ proposals: await this.proposalService.listRecentProposals() });
    } catch (error) {
      next(error);
    }
  };

  get = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ proposal: await this.proposalService.getProposal(requireStringParam(request, "id")) });
    } catch (error) {
      next(error);
    }
  };

  approve = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const indexingOutcomeOverride =
        request.body.indexingOutcomeOverride === "keep_searchable" ||
        request.body.indexingOutcomeOverride === "create_knowledge"
          ? request.body.indexingOutcomeOverride
          : null;
      response.json({
        proposal: await this.proposalService.approveProposal(requireStringParam(request, "id"), {
          indexingOutcomeOverride,
        }),
      });
    } catch (error) {
      next(error);
    }
  };

  reject = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        proposal: await this.proposalService.rejectProposal(
          requireStringParam(request, "id"),
          typeof request.body.comment === "string" ? request.body.comment : null,
        ),
      });
    } catch (error) {
      next(error);
    }
  };
}
