import type { NextFunction, Request, Response } from "express";
import type { RawSourceService } from "../services/rawSource.service.js";
import { requireStringParam } from "./requestParams.js";

export class RawSourceController {
  constructor(private readonly rawSourceService: RawSourceService) {}

  list = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ rawSources: await this.rawSourceService.listRecentRawSources() });
    } catch (error) {
      next(error);
    }
  };

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(201).json({ rawSource: await this.rawSourceService.createRawSource(request.body) });
    } catch (error) {
      next(error);
    }
  };

  get = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ rawSource: await this.rawSourceService.getRawSource(requireStringParam(request, "id")) });
    } catch (error) {
      next(error);
    }
  };

  update = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        rawSource: await this.rawSourceService.updateRawSource(
          requireStringParam(request, "id"),
          request.body,
        ),
      });
    } catch (error) {
      next(error);
    }
  };

  compile = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await this.rawSourceService.compileRawSource(requireStringParam(request, "id"));
      response.status(result.agentRunId ? 202 : 200).json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.rawSourceService.deleteRawSource(requireStringParam(request, "id"));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
