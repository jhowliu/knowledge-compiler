import type { DraftUpdateProposal } from "../../src/domain/compiler.js";
import type {
  ProposalStatus,
  ProposalWithItems,
  UpdateProposal,
} from "../../src/domain/knowledge.js";
import type { ProposalRepository } from "../../src/repositories/proposal.repository.js";

export class InMemoryProposalRepository implements ProposalRepository {
  readonly proposals: ProposalWithItems[] = [];

  async create(input: {
    userId?: string | null;
    rawNoteId: string;
    draft: DraftUpdateProposal;
  }): Promise<ProposalWithItems> {
    const proposal: ProposalWithItems = {
      id: `proposal-${this.proposals.length + 1}`,
      userId: input.userId ?? null,
      rawNoteId: input.rawNoteId,
      detectedDomain: input.draft.detectedDomain,
      detectedKnowledgeType: input.draft.detectedKnowledgeType,
      impactLevel: input.draft.impactLevel,
      confidence: input.draft.confidence,
      status: "pending",
      rationale: input.draft.rationale,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
      items: input.draft.items.map((item, index) => ({
        id: `item-${index + 1}`,
        proposalId: `proposal-${this.proposals.length + 1}`,
        actionType: item.actionType,
        targetType: item.targetType,
        targetId: null,
        payload: item.payload,
        rationale: item.rationale,
        status: "pending",
        createdAt: new Date("2026-05-24T00:00:00.000Z"),
      })),
    };
    this.proposals.push(proposal);
    return proposal;
  }

  async getById(id: string): Promise<ProposalWithItems | null> {
    return this.proposals.find((proposal) => proposal.id === id) ?? null;
  }

  async listRecent(): Promise<ProposalWithItems[]> {
    return this.proposals;
  }

  async setStatus(id: string, status: ProposalStatus): Promise<UpdateProposal> {
    const proposal = await this.getById(id);
    if (!proposal) {
      throw new Error("Proposal not found");
    }
    proposal.status = status;
    return proposal;
  }

  async setItemStatus(proposalId: string, status: ProposalStatus): Promise<void> {
    const proposal = await this.getById(proposalId);
    proposal?.items.forEach((item) => {
      item.status = status;
    });
  }

  async recordDecision(): Promise<void> {}
}
