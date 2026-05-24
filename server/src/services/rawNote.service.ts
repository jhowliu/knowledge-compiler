import type { CreateRawNoteInput } from "../domain/rawNote.js";
import type { RawNoteRepository } from "../repositories/rawNote.repository.js";

export class RawNoteService {
  constructor(private readonly rawNoteRepository: RawNoteRepository) {}

  async createRawNote(input: CreateRawNoteInput) {
    return this.rawNoteRepository.create(input);
  }

  async listRecentRawNotes() {
    return this.rawNoteRepository.listRecent(50);
  }
}

export type ValidatedCreateRawNoteInput = CreateRawNoteInput;
