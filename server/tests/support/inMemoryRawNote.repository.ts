import type { CreateRawNoteInput, RawNote, UpdateRawNoteInput } from "../../src/domain/rawNote.js";
import type { RawNoteRepository } from "../../src/repositories/rawNote.repository.js";

export class InMemoryRawNoteRepository implements RawNoteRepository {
  readonly notes: RawNote[] = [];

  async create(input: CreateRawNoteInput): Promise<RawNote> {
    const note: RawNote = {
      id: `raw-note-${this.notes.length + 1}`,
      userId: input.userId ?? null,
      rawSourceId: input.rawSourceId ?? null,
      sourceType: input.sourceType ?? "manual",
      sourceRole: input.sourceRole ?? "personal_note",
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

  async getByRawSourceId(rawSourceId: string): Promise<RawNote | null> {
    return this.notes.find((note) => note.rawSourceId === rawSourceId) ?? null;
  }

  async listRecent(limit: number): Promise<RawNote[]> {
    return this.notes.slice(0, limit);
  }

  async update(id: string, input: UpdateRawNoteInput): Promise<RawNote | null> {
    const note = await this.getById(id);
    if (!note) {
      return null;
    }

    note.sourceType = input.sourceType ?? "manual";
    note.sourceRole = input.sourceRole ?? "personal_note";
    note.title = input.title ?? null;
    note.bodyMarkdown = input.bodyMarkdown;
    note.extractedData = {};
    return note;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.notes.findIndex((note) => note.id === id);
    if (index === -1) {
      return false;
    }

    this.notes.splice(index, 1);
    return true;
  }

  async updateExtraction(id: string, extractedData: unknown): Promise<RawNote> {
    const note = await this.getById(id);
    if (!note) {
      throw new Error("Raw note not found");
    }

    note.extractedData = extractedData;
    return note;
  }
}
