import type { NextFunction, Request, Response } from "express";
import type { NoteCardPositionService } from "../services/noteCardPosition.service.js";
import { requireStringParam } from "./requestParams.js";

export class NoteCardPositionController {
  constructor(private readonly noteCardPositionService: NoteCardPositionService) {}

  list = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        noteCardPositions: await this.noteCardPositionService.listForBoard(
          typeof request.query.boardKey === "string" ? request.query.boardKey : null,
        ),
      });
    } catch (error) {
      next(error);
    }
  };

  save = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        noteCardPosition: await this.noteCardPositionService.savePosition({
          noteId: requireStringParam(request, "noteId"),
          ...request.body,
        }),
      });
    } catch (error) {
      next(error);
    }
  };

  reset = async (request: Request, response: Response, next: NextFunction) => {
    try {
      response.json({
        result: await this.noteCardPositionService.resetBoard(
          typeof request.query.boardKey === "string" ? request.query.boardKey : null,
        ),
      });
    } catch (error) {
      next(error);
    }
  };
}
