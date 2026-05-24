import type { NextFunction, Request, Response } from "express";
import type { NoteLinkService } from "../services/noteLink.service.js";
import { requireStringParam } from "./requestParams.js";

export class NoteLinkController {
  constructor(private readonly noteLinkService: NoteLinkService) {}

  graph = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ noteLinks: await this.noteLinkService.listGraphLinks() });
    } catch (error) {
      next(error);
    }
  };

  forNote = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        noteLinks: await this.noteLinkService.listLinksForNote(requireStringParam(request, "noteId")),
      });
    } catch (error) {
      next(error);
    }
  };

  approve = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ noteLink: await this.noteLinkService.approveLink(requireStringParam(request, "id")) });
    } catch (error) {
      next(error);
    }
  };

  reject = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({ noteLink: await this.noteLinkService.rejectLink(requireStringParam(request, "id")) });
    } catch (error) {
      next(error);
    }
  };
}
