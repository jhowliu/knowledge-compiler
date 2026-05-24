import type { ProposalItem, ProposalWithItems } from "../domain/knowledge.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(payload: Record<string, unknown>, key: string, fallback = "") {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}

export class ProposalService {
  constructor(
    private readonly proposalRepository: ProposalRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
  ) {}

  async listRecentProposals() {
    return this.proposalRepository.listRecent(25);
  }

  async getProposal(id: string) {
    const proposal = await this.proposalRepository.getById(id);
    if (!proposal) {
      throw new Error("Proposal not found");
    }
    return proposal;
  }

  async approveProposal(id: string) {
    const proposal = await this.getProposal(id);
    if (proposal.status !== "pending") {
      return proposal;
    }

    for (const item of proposal.items) {
      await this.applyItem(proposal, item);
    }

    await this.proposalRepository.setItemStatus(id, "approved");
    await this.proposalRepository.recordDecision({
      proposalId: id,
      userId: proposal.userId,
      decision: "approved",
    });
    await this.proposalRepository.setStatus(id, "approved");

    return this.getProposal(id);
  }

  async rejectProposal(id: string, comment?: string | null) {
    const proposal = await this.getProposal(id);
    await this.proposalRepository.setItemStatus(id, "rejected");
    await this.proposalRepository.recordDecision({
      proposalId: id,
      userId: proposal.userId,
      decision: "rejected",
      comment,
    });
    await this.proposalRepository.setStatus(id, "rejected");

    return this.getProposal(id);
  }

  private async applyItem(proposal: ProposalWithItems, item: ProposalItem) {
    const payload = asRecord(item.payload);

    if (item.actionType === "upsert_compiled_note") {
      const compiledNote = await this.knowledgeRepository.upsertCompiledNote({
        userId: proposal.userId,
        domain: stringValue(payload, "domain", "coding"),
        noteType: stringValue(payload, "noteType", "note"),
        title: stringValue(payload, "title", "Untitled Note"),
        bodyMarkdown: stringValue(payload, "bodyMarkdown"),
        structuredData: payload.structuredData ?? {},
      });

      await this.knowledgeRepository.createEvidenceLink({
        userId: proposal.userId,
        sourceType: "raw_note",
        sourceId: proposal.rawNoteId ?? proposal.id,
        targetType: "compiled_note",
        targetId: compiledNote.id,
        confidence: proposal.confidence,
        impactLevel: proposal.impactLevel,
        approvalStatus: "approved",
      });

      const structuredData = asRecord(payload.structuredData);
      const concepts = Array.isArray(structuredData.concepts) ? structuredData.concepts : [];
      for (const concept of concepts) {
        const conceptRecord = asRecord(concept);
        const name = stringValue(conceptRecord, "name");
        const conceptType = stringValue(conceptRecord, "conceptType", "topic");
        if (!name) {
          continue;
        }
        const savedConcept = await this.knowledgeRepository.upsertConcept({
          userId: proposal.userId,
          name,
          conceptType,
        });
        await this.knowledgeRepository.indexConcept({
          userId: proposal.userId,
          conceptId: savedConcept.id,
          targetType: "compiled_note",
          targetId: compiledNote.id,
          relationType: "canonicalizes",
          confidence: proposal.confidence,
          source: "approved_proposal",
        });
      }
      return;
    }

    if (item.actionType === "create_mistake") {
      const mistake = await this.knowledgeRepository.upsertMistake({
        userId: proposal.userId,
        domain: stringValue(payload, "domain", "coding"),
        category: stringValue(payload, "category", "Pattern Recognition"),
        title: stringValue(payload, "title", "Coding mistake"),
        description: stringValue(payload, "description"),
      });
      await this.knowledgeRepository.createEvidenceLink({
        userId: proposal.userId,
        sourceType: "raw_note",
        sourceId: proposal.rawNoteId ?? proposal.id,
        targetType: "mistake",
        targetId: mistake.id,
        confidence: proposal.confidence,
        impactLevel: proposal.impactLevel,
        approvalStatus: "approved",
      });
      return;
    }

    if (item.actionType === "create_review_task") {
      await this.knowledgeRepository.createReviewTask({
        userId: proposal.userId,
        domain: stringValue(payload, "domain", "coding"),
        title: stringValue(payload, "title", "Review coding note"),
        description: stringValue(payload, "description"),
        sourceType: "proposal",
        sourceId: proposal.id,
      });
      return;
    }

    if (item.actionType === "upsert_readiness") {
      await this.knowledgeRepository.upsertReadinessItem({
        userId: proposal.userId,
        domain: stringValue(payload, "domain", "coding"),
        area: stringValue(payload, "area", "Coding"),
        status: stringValue(payload, "status", "Needs Review") as never,
        rationale: stringValue(payload, "rationale"),
      });
    }
  }
}
