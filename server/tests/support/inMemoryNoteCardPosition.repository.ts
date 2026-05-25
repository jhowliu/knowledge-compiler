import type { NoteCardPosition } from "../../src/domain/knowledge.js";
import type { NoteCardPositionRepository } from "../../src/repositories/noteCardPosition.repository.js";

export class InMemoryNoteCardPositionRepository implements NoteCardPositionRepository {
  readonly noteCardPositions: NoteCardPosition[] = [];

  async listForBoard(boardKey: string): Promise<NoteCardPosition[]> {
    return this.noteCardPositions.filter((position) => position.boardKey === boardKey);
  }

  async upsert(input: {
    userId?: string | null;
    boardKey: string;
    noteId: string;
    x: number;
    y: number;
  }): Promise<NoteCardPosition | null> {
    const existing = this.noteCardPositions.find(
      (position) => position.boardKey === input.boardKey && position.noteId === input.noteId,
    );

    if (existing) {
      existing.x = input.x;
      existing.y = input.y;
      existing.updatedAt = new Date("2026-05-25T00:00:00.000Z");
      return existing;
    }

    const position: NoteCardPosition = {
      id: `note-card-position-${this.noteCardPositions.length + 1}`,
      userId: input.userId ?? null,
      boardKey: input.boardKey,
      noteId: input.noteId,
      x: input.x,
      y: input.y,
      createdAt: new Date("2026-05-25T00:00:00.000Z"),
      updatedAt: new Date("2026-05-25T00:00:00.000Z"),
    };
    this.noteCardPositions.push(position);
    return position;
  }
}
