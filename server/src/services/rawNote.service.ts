import { AppError } from "../domain/errors.js";
import type { CreateRawNoteInput, UpdateRawNoteInput } from "../domain/rawNote.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";
import type { RawNoteRepository } from "../repositories/rawNote.repository.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";
import type { AgentRunQueueService } from "./agentRunQueue.service.js";
import type { PhaseOneWorkflowService } from "./phaseOneWorkflow.service.js";
import { chunkSourceMarkdown } from "./sourceChunker.service.js";

export class RawNoteService {
  constructor(
    private readonly rawNoteRepository: RawNoteRepository,
    private readonly phaseOneWorkflowService?: PhaseOneWorkflowService | null,
    private readonly agentRunQueueService?: AgentRunQueueService | null,
    private readonly proposalRepository?: ProposalRepository | null,
    private readonly agentRunRepository?: AgentRunRepository | null,
    private readonly rawSourceRepository?: RawSourceRepository | null,
  ) {}

  async createRawNote(input: CreateRawNoteInput) {
    const sourceRole = input.sourceRole ?? "personal_note";
    const rawSource = this.rawSourceRepository
      ? await this.rawSourceRepository.create(
          {
            userId: input.userId,
            domain: input.domain,
            sourceType: input.sourceType ?? "markdown",
            sourceRole,
            title: input.title,
            bodyMarkdown: input.bodyMarkdown,
            metadata: { createdVia: "raw_notes" },
          },
          chunkSourceMarkdown(input.bodyMarkdown),
        )
      : null;
    const rawNote = await this.rawNoteRepository.create({
      ...input,
      rawSourceId: rawSource?.id ?? input.rawSourceId ?? null,
      sourceRole,
    });
    if (this.agentRunQueueService) {
      const agentRun = await this.enqueueCompileRun(rawNote.id, rawNote.userId, rawNote.rawSourceId);
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
    const existingRawNote = await this.rawNoteRepository.getById(id);
    if (!existingRawNote) {
      throw new AppError("Raw note not found", 404);
    }

    const sourceRole = input.sourceRole ?? existingRawNote.sourceRole ?? "personal_note";
    if (this.rawSourceRepository && existingRawNote.rawSourceId) {
      await this.rawSourceRepository.update(
        existingRawNote.rawSourceId,
        {
          domain: input.domain,
          sourceType: input.sourceType ?? existingRawNote.sourceType,
          sourceRole,
          title: input.title,
          bodyMarkdown: input.bodyMarkdown,
          metadata: { updatedVia: "raw_notes" },
        },
        chunkSourceMarkdown(input.bodyMarkdown),
      );
    }

    const rawNote = await this.rawNoteRepository.update(id, { ...input, sourceRole });
    if (!rawNote) {
      throw new AppError("Raw note not found", 404);
    }

    return rawNote;
  }

  async deleteRawNote(id: string) {
    const rawNote = await this.rawNoteRepository.getById(id);
    const deleted = await this.rawNoteRepository.delete(id);
    if (!deleted) {
      throw new AppError("Raw note not found", 404);
    }
    if (rawNote?.rawSourceId && this.rawSourceRepository) {
      await this.rawSourceRepository.delete(rawNote.rawSourceId);
    }
  }

  async compileRawNote(id: string) {
    const rawNote = await this.rawNoteRepository.getById(id);
    if (!rawNote) {
      throw new AppError("Raw note not found", 404);
    }

    if (!this.phaseOneWorkflowService) {
      if (this.agentRunQueueService) {
        const agentRun = await this.enqueueCompileRun(rawNote.id, rawNote.userId, rawNote.rawSourceId);
        return { proposal: null, agentRunId: agentRun.id };
      }
      return { proposal: null, agentRunId: null };
    }

    if (this.agentRunQueueService) {
      const agentRun = await this.enqueueCompileRun(rawNote.id, rawNote.userId, rawNote.rawSourceId);
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
    const latestFailedRun = agentRuns.find((agentRun) => agentRun.status === "failed");
    const status = hasActiveRun
      ? "Indexing"
      : latestFailedRun && !latestProposal
        ? "Failed"
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

  private async enqueueCompileRun(rawNoteId: string, userId?: string | null, rawSourceId?: string | null) {
    if (!this.agentRunQueueService) {
      throw new AppError("Agent run queue is not configured", 500);
    }

    const agentRun = await this.agentRunQueueService.enqueue({
      userId,
      runType: "compile_raw_note",
      input: rawSourceId ? { rawSourceId, rawNoteId } : { rawNoteId },
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
