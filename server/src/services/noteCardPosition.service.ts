import { AppError } from "../domain/errors.js";
import type { NoteCardPositionRepository } from "../repositories/noteCardPosition.repository.js";

const defaultBoardKey = "default";

function boardKeyOrDefault(boardKey: string | undefined | null) {
  return boardKey?.trim() || defaultBoardKey;
}

export class NoteCardPositionService {
  constructor(private readonly noteCardPositionRepository: NoteCardPositionRepository) {}

  async listForBoard(boardKey?: string | null) {
    return this.noteCardPositionRepository.listForBoard(boardKeyOrDefault(boardKey));
  }

  async resetBoard(boardKey?: string | null) {
    const normalizedBoardKey = boardKeyOrDefault(boardKey);
    return {
      boardKey: normalizedBoardKey,
      deletedCount: await this.noteCardPositionRepository.deleteForBoard(normalizedBoardKey),
    };
  }

  async savePosition(input: {
    userId?: string | null;
    boardKey?: string | null;
    noteId: string;
    x: number;
    y: number;
  }) {
    const position = await this.noteCardPositionRepository.upsert({
      userId: input.userId,
      boardKey: boardKeyOrDefault(input.boardKey),
      noteId: input.noteId,
      x: input.x,
      y: input.y,
    });

    if (!position) {
      throw new AppError("Unable to save note card position", 400);
    }

    return position;
  }
}
