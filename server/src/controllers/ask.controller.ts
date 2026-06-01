import type { NextFunction, Request, Response } from "express";
import type { AskService } from "../services/ask.service.js";

export class AskController {
  constructor(private readonly askService: AskService) {}

  ask = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const result = await this.askService.ask({
        query: request.body.query,
        topicIds: request.body.topic_ids ?? request.body.topicIds ?? [],
      });
      response.json({
        answer: result.answer,
        citations: result.citations.map((citation) => ({
          block_id: citation.blockId,
          title: citation.title,
          chunk_text: citation.chunkText,
          source_note_title: citation.sourceNoteTitle,
          source_note_id: citation.sourceNoteId,
        })),
      });
    } catch (error) {
      next(error);
    }
  };
}
