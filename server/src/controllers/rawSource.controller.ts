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

  organization = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ sourceOrganization: await this.rawSourceService.getSourceOrganization() });
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

  createProject = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response
        .status(201)
        .json({ sourceProject: await this.rawSourceService.createSourceProject(request.body) });
    } catch (error) {
      next(error);
    }
  };

  createFolder = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.status(201).json({
        sourceFolder: await this.rawSourceService.createSourceFolder(
          requireStringParam(request, "projectId"),
          request.body,
        ),
      });
    } catch (error) {
      next(error);
    }
  };

  renameProject = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        sourceProject: await this.rawSourceService.renameSourceProject(
          requireStringParam(request, "projectId"),
          request.body,
        ),
      });
    } catch (error) {
      next(error);
    }
  };

  renameFolder = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        sourceFolder: await this.rawSourceService.renameSourceFolder(
          requireStringParam(request, "projectId"),
          requireStringParam(request, "folderId"),
          request.body,
        ),
      });
    } catch (error) {
      next(error);
    }
  };

  deleteProject = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.rawSourceService.deleteSourceProject(requireStringParam(request, "projectId"));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  deleteFolder = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.rawSourceService.deleteSourceFolder(
        requireStringParam(request, "projectId"),
        requireStringParam(request, "folderId"),
      );
      response.status(204).send();
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

  updateTopics = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        rawSource: await this.rawSourceService.updateSourceTopics(
          requireStringParam(request, "id"),
          request.body.topicIds,
        ),
      });
    } catch (error) {
      next(error);
    }
  };

  move = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        rawSource: await this.rawSourceService.moveRawSource(
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

  indexingTrace = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const indexingTrace = await this.rawSourceService.getIndexingTrace(requireStringParam(request, "id"));
      response.json({ indexingTrace });
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
