import type { NextFunction, Request, Response } from "express";
import type { DashboardService } from "../services/dashboard.service.js";
import { requireStringParam } from "./requestParams.js";

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  compiledNotes = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ compiledNotes: await this.dashboardService.listCompiledNotes() });
    } catch (error) {
      next(error);
    }
  };

  reviewMaps = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ reviewMaps: await this.dashboardService.listReviewMaps() });
    } catch (error) {
      next(error);
    }
  };

  search = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = typeof request.query.q === "string" ? request.query.q : "";
      const includeArchived = request.query.includeArchived === "true";
      const limit = typeof request.query.limit === "string" ? Number(request.query.limit) : undefined;
      const domain = typeof request.query.domain === "string" ? request.query.domain.trim() : "";
      const knowledgeType =
        typeof request.query.knowledgeType === "string" ? request.query.knowledgeType.trim() : "";
      const sourceRole = typeof request.query.sourceRole === "string" ? request.query.sourceRole.trim() : "";
      response.json({
        results: query
          ? await this.dashboardService.search(query, {
              includeArchived,
              limit: Number.isFinite(limit) ? limit : undefined,
              domain: domain || null,
              knowledgeType: knowledgeType || null,
              sourceRole: sourceRole || null,
            })
          : [],
      });
    } catch (error) {
      next(error);
    }
  };

  knowledgeSourceTimeline = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        timeline: await this.dashboardService.getKnowledgeSourceTimeline(requireStringParam(request, "id")),
      });
    } catch (error) {
      next(error);
    }
  };

  compiledNoteTimeline = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        timeline: await this.dashboardService.getCompiledNoteTimeline(requireStringParam(request, "id")),
      });
    } catch (error) {
      next(error);
    }
  };
}
