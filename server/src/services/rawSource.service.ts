import { AppError } from "../domain/errors.js";
import type { CreateRawSourceInput, UpdateRawSourceInput } from "../domain/rawSource.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { AgentRunQueueService } from "./agentRunQueue.service.js";
import { chunkSourceMarkdown } from "./sourceChunker.service.js";

export class RawSourceService {
  constructor(
    private readonly rawSourceRepository: RawSourceRepository,
    private readonly agentRunQueueService?: AgentRunQueueService | null,
    private readonly proposalRepository?: ProposalRepository | null,
    private readonly agentRunRepository?: AgentRunRepository | null,
  ) {}

  async getIndexingTrace(id: string) {
    const rawSource = await this.getRawSource(id);

    const proposals = this.proposalRepository
      ? await this.proposalRepository.listBySource(id)
      : [];
    const agentRuns = this.agentRunRepository
      ? await this.agentRunRepository.listBySource(id)
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
      rawSource,
      status,
      agentRuns,
      proposals,
      extractedData: rawSource.extractedData,
    };
  }

  async createRawSource(input: CreateRawSourceInput) {
    const source = await this.rawSourceRepository.create(
      input,
      chunkSourceMarkdown(input.bodyMarkdown),
    );
    return source;
  }

  async listRecentRawSources() {
    return this.rawSourceRepository.listRecent(50);
  }

  async getRawSource(id: string) {
    const rawSource = await this.rawSourceRepository.getById(id);
    if (!rawSource) {
      throw new AppError("Raw source not found", 404);
    }
    return rawSource;
  }

  async updateRawSource(id: string, input: UpdateRawSourceInput) {
    const rawSource = await this.rawSourceRepository.update(
      id,
      input,
      chunkSourceMarkdown(input.bodyMarkdown),
    );
    if (!rawSource) {
      throw new AppError("Raw source not found", 404);
    }
    return rawSource;
  }

  async deleteRawSource(id: string) {
    const deleted = await this.rawSourceRepository.delete(id);
    if (!deleted) {
      throw new AppError("Raw source not found", 404);
    }
  }

  async compileRawSource(id: string) {
    const rawSource = await this.getRawSource(id);

    if (!this.agentRunQueueService) {
      return {
        rawSource,
        proposal: null,
        agentRunId: null,
      };
    }

    const agentRun = await this.agentRunQueueService.enqueue({
      userId: rawSource.userId,
      runType: "compile_raw_note",
      input: {
        rawSourceId: rawSource.id,
      },
    });
    setTimeout(() => {
      this.agentRunQueueService?.process(agentRun.id).catch((error) => {
        console.error("compile_raw_note agent run failed", error);
      });
    }, 0);

    return {
      rawSource,
      proposal: null,
      agentRunId: agentRun.id,
    };
  }
}
