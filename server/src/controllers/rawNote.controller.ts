import type { NextFunction, Request, Response } from "express";
import type { RawNoteService } from "../services/rawNote.service.js";
import { requireStringParam } from "./requestParams.js";

export class RawNoteController {
  constructor(private readonly rawNoteService: RawNoteService) {}

  list = async (_request: Request, response: Response, next: NextFunction) => {
    try {
      const rawNotes = await this.rawNoteService.listRecentRawNotes();
      response.json({ rawNotes });
    } catch (error) {
      next(error);
    }
  };

  create = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await this.rawNoteService.createRawNote(request.body);
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const rawNote = await this.rawNoteService.updateRawNote(
        requireStringParam(request, "id"),
        request.body,
      );
      response.json({ rawNote });
    } catch (error) {
      next(error);
    }
  };

  delete = async (request: Request, response: Response, next: NextFunction) => {
    try {
      await this.rawNoteService.deleteRawNote(requireStringParam(request, "id"));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  compile = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await this.rawNoteService.compileRawNote(requireStringParam(request, "id"));
      response.json(result);
    } catch (error) {
      next(error);
    }
  };

  indexingTrace = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        indexingTrace: await this.rawNoteService.getIndexingTrace(requireStringParam(request, "id")),
      });
    } catch (error) {
      next(error);
    }
  };
}
