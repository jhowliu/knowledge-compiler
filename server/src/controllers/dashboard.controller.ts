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

  mistakes = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ mistakes: await this.dashboardService.listMistakes() });
    } catch (error) {
      next(error);
    }
  };

  reviewTasks = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ reviewTasks: await this.dashboardService.listReviewTasks() });
    } catch (error) {
      next(error);
    }
  };

  completeReviewTask = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        reviewTask: await this.dashboardService.completeReviewTask(requireStringParam(request, "id")),
      });
    } catch (error) {
      next(error);
    }
  };

  readinessMap = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ readinessItems: await this.dashboardService.listReadinessItems() });
    } catch (error) {
      next(error);
    }
  };

  search = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = typeof request.query.q === "string" ? request.query.q : "";
      response.json({ results: query ? await this.dashboardService.search(query) : [] });
    } catch (error) {
      next(error);
    }
  };
}
