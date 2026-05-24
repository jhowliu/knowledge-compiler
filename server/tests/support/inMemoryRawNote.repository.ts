import type { CreateRawNoteInput, RawNote } from "../../src/domain/rawNote.js";
import type { RawNoteRepository } from "../../src/repositories/rawNote.repository.js";

export class InMemoryRawNoteRepository implements RawNoteRepository {
  readonly notes: RawNote[] = [];

  async create(input: CreateRawNoteInput): Promise<RawNote> {
    const note: RawNote = {
      id: `raw-note-${this.notes.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain ?? null,
      sourceType: input.sourceType ?? "manual",
      title: input.title ?? null,
      bodyMarkdown: input.bodyMarkdown,
      extractedData: {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.notes.unshift(note);
    return note;
  }

  async listRecent(limit: number): Promise<RawNote[]> {
    return this.notes.slice(0, limit);
  }
}
