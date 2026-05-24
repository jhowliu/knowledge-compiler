import type { NextFunction, Request, Response } from "express";
import type { RawNoteService } from "../services/rawNote.service.js";

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
      const rawNote = await this.rawNoteService.createRawNote(request.body);
      response.status(201).json({ rawNote });
    } catch (error) {
      next(error);
    }
  };
}
