import { AppError } from "../domain/errors.js";
import type { CreateRawNoteInput, UpdateRawNoteInput } from "../domain/rawNote.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";
import type { RawNoteRepository } from "../repositories/rawNote.repository.js";
import type { AgentRunQueueService } from "./agentRunQueue.service.js";
import type { PhaseOneWorkflowService } from "./phaseOneWorkflow.service.js";

export class RawNoteService {
  constructor(
    private readonly rawNoteRepository: RawNoteRepository,
    private readonly phaseOneWorkflowService?: PhaseOneWorkflowService | null,
    private readonly agentRunQueueService?: AgentRunQueueService | null,
    private readonly proposalRepository?: ProposalRepository | null,
    private readonly agentRunRepository?: AgentRunRepository | null,
  ) {}

  async createRawNote(input: CreateRawNoteInput) {
    const rawNote = await this.rawNoteRepository.create(input);
    if (this.agentRunQueueService) {
      const agentRun = await this.enqueueCompileRun(rawNote.id, rawNote.userId);
      return { rawNote, proposal: null, agentRunId: agentRun.id };
    }

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
      if (this.agentRunQueueService) {
        const agentRun = await this.enqueueCompileRun(rawNote.id, rawNote.userId);
        return { proposal: null, agentRunId: agentRun.id };
      }
      return { proposal: null, agentRunId: null };
    }

    if (this.agentRunQueueService) {
      const agentRun = await this.enqueueCompileRun(rawNote.id, rawNote.userId);
      return { proposal: null, agentRunId: agentRun.id };
    }

    const result = await this.phaseOneWorkflowService.ingestRawNote(id);
    return {
      proposal: result.proposal,
      agentRunId: result.agentRunId,
    };
  }

  async getIndexingTrace(id: string) {
    const rawNote = await this.rawNoteRepository.getById(id);
    if (!rawNote) {
      throw new AppError("Raw note not found", 404);
    }

    const proposals = this.proposalRepository
      ? await this.proposalRepository.listByRawNote(id)
      : [];
    const agentRuns = this.agentRunRepository
      ? await this.agentRunRepository.listByRawNote(id)
      : [];
    const hasActiveRun = agentRuns.some((agentRun) =>
      ["queued", "running"].includes(agentRun.status),
    );
    const latestProposal = proposals[0] ?? null;
    const status = hasActiveRun
      ? "Indexing"
      : latestProposal?.status === "approved"
        ? "Approved"
        : latestProposal?.status === "rejected"
          ? "Rejected"
          : latestProposal
            ? "Proposed"
            : "Not compiled";

    return {
      rawNote,
      status,
      agentRuns,
      proposals,
      extractedData: rawNote.extractedData,
    };
  }

  private async enqueueCompileRun(rawNoteId: string, userId?: string | null) {
    if (!this.agentRunQueueService) {
      throw new AppError("Agent run queue is not configured", 500);
    }

    const agentRun = await this.agentRunQueueService.enqueue({
      userId,
      runType: "compile_raw_note",
      input: { rawNoteId },
    });
    setTimeout(() => {
      this.agentRunQueueService?.process(agentRun.id).catch((error) => {
        console.error("compile_raw_note agent run failed", error);
      });
    }, 0);
    return agentRun;
  }
}

export type ValidatedCreateRawNoteInput = CreateRawNoteInput;
