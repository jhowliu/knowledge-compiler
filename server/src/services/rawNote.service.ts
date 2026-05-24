import { AppError } from "../domain/errors.js";
import type { CreateRawNoteInput, UpdateRawNoteInput } from "../domain/rawNote.js";
import type { RawNoteRepository } from "../repositories/rawNote.repository.js";
import type { PhaseOneWorkflowService } from "./phaseOneWorkflow.service.js";

export class RawNoteService {
  constructor(
    private readonly rawNoteRepository: RawNoteRepository,
    private readonly phaseOneWorkflowService?: PhaseOneWorkflowService | null,
  ) {}

  async createRawNote(input: CreateRawNoteInput) {
    const rawNote = await this.rawNoteRepository.create(input);
    if (!this.phaseOneWorkflowService) {
      return { rawNote, proposal: null, agentRunId: null };
    }

    const result = await this.phaseOneWorkflowService.ingestRawNote(rawNote.id);
    return {
      rawNote,
      proposal: result.proposal,
      agentRunId: result.agentRunId,
    };
  }

  async listRecentRawNotes() {
    return this.rawNoteRepository.listRecent(50);
  }

  async updateRawNote(id: string, input: UpdateRawNoteInput) {
    const rawNote = await this.rawNoteRepository.update(id, input);
    if (!rawNote) {
      throw new AppError("Raw note not found", 404);
    }

    return rawNote;
  }

  async deleteRawNote(id: string) {
    const deleted = await this.rawNoteRepository.delete(id);
    if (!deleted) {
      throw new AppError("Raw note not found", 404);
    }
  }

  async compileRawNote(id: string) {
    const rawNote = await this.rawNoteRepository.getById(id);
    if (!rawNote) {
      throw new AppError("Raw note not found", 404);
    }

    if (!this.phaseOneWorkflowService) {
      return { proposal: null, agentRunId: null };
    }

    const result = await this.phaseOneWorkflowService.ingestRawNote(id);
    return {
      proposal: result.proposal,
      agentRunId: result.agentRunId,
    };
  }
}

export type ValidatedCreateRawNoteInput = CreateRawNoteInput;
