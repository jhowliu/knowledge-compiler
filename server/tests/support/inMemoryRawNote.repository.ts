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

  async getById(id: string): Promise<RawNote | null> {
    return this.notes.find((note) => note.id === id) ?? null;
  }

  async listRecent(limit: number): Promise<RawNote[]> {
    return this.notes.slice(0, limit);
  }

  async updateExtraction(id: string, extractedData: unknown, domain: string | null): Promise<RawNote> {
    const note = await this.getById(id);
    if (!note) {
      throw new Error("Raw note not found");
    }

    note.extractedData = extractedData;
    note.domain = domain ?? note.domain;
    return note;
  }
}
