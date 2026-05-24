import type { CreateRawNoteInput } from "../domain/rawNote.js";
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
}

export type ValidatedCreateRawNoteInput = CreateRawNoteInput;
