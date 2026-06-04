import type {
  AppliedIndexingOutcome,
  CompiledNote,
  Confidence,
  ProposalItem,
  ProposalWithItems,
} from "../domain/knowledge.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { NoteLinkRepository } from "../repositories/noteLink.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";
import {
  embedKnowledgeBlock,
  NoopEmbeddingService,
  type EmbeddingService,
} from "./embedding.service.js";
import {
  hasKnowledgeFacets,
  renderKnowledgeFacetsMarkdown,
} from "./knowledgeFacets.service.js";
import { chunkKnowledgeMarkdown } from "./sourceChunker.service.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(payload: Record<string, unknown>, key: string, fallback = "") {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}

function confidenceValue(value: unknown, fallback: Confidence): Confidence {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function normalizedTitle(value: string) {
  return value.trim().toLowerCase();
}

function validAppliedOutcome(value: unknown): AppliedIndexingOutcome | null {
  return value === "keep_searchable" ||
    value === "create_knowledge" ||
    value === "update_existing_knowledge"
    ? value
    : null;
}

type ApplyContext = {
  compiledNoteByTitle: Map<string, CompiledNote>;
};

type IndexingOutcomeOverride = "keep_searchable" | "create_knowledge" | null;

function appliedOutcomeFor(
  proposal: ProposalWithItems,
  indexingOutcomeOverride: IndexingOutcomeOverride,
): AppliedIndexingOutcome {
  if (indexingOutcomeOverride) {
    return indexingOutcomeOverride;
  }
  for (const item of proposal.items) {
    const outcome = validAppliedOutcome(asRecord(item.payload).outcome);
    if (outcome) return outcome;
  }
  return proposal.items.some((item) => item.actionType === "keep_source_searchable")
    ? "keep_searchable"
    : "create_knowledge";
}

export class ProposalService {
  constructor(
    private readonly proposalRepository: ProposalRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly noteLinkRepository: NoteLinkRepository,
    private readonly embeddingService: EmbeddingService = new NoopEmbeddingService(),
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

  async approveProposal(id: string, options: { indexingOutcomeOverride?: IndexingOutcomeOverride } = {}) {
    const proposal = await this.getProposal(id);
    if (proposal.status !== "pending") {
      return proposal;
    }

    const context: ApplyContext = { compiledNoteByTitle: new Map() };
    for (const item of proposal.items) {
      await this.applyItem(proposal, item, context, options.indexingOutcomeOverride ?? null);
    }

    await this.proposalRepository.setItemStatus(id, "approved");
    await this.proposalRepository.recordDecision({
      proposalId: id,
      userId: proposal.userId,
      decision: "approved",
      comment: JSON.stringify({
        appliedIndexingOutcome: appliedOutcomeFor(proposal, options.indexingOutcomeOverride ?? null),
      }),
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

  private async applyItem(
    proposal: ProposalWithItems,
    item: ProposalItem,
    context: ApplyContext,
    indexingOutcomeOverride: IndexingOutcomeOverride,
  ) {
    const payload = asRecord(item.payload);

    if (
      indexingOutcomeOverride === "keep_searchable" &&
      (item.actionType === "upsert_compiled_note" ||
        item.actionType === "upsert_knowledge" ||
        item.actionType === "create_link")
    ) {
      return;
    }

    if (item.actionType === "keep_source_searchable") {
      if (indexingOutcomeOverride !== "create_knowledge") {
        return;
      }

      const knowledgeProposal = asRecord(payload.knowledgeProposal);
      await this.applyItem(
        proposal,
        {
          ...item,
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: {
            domain: stringValue(knowledgeProposal, "domain", stringValue(payload, "domain", "general")),
            knowledgeType: stringValue(
              knowledgeProposal,
              "knowledgeType",
              stringValue(payload, "knowledgeType", "knowledge_note"),
            ),
            title: stringValue(knowledgeProposal, "title", stringValue(payload, "title", "Untitled Note")),
            bodyMarkdown: stringValue(
              knowledgeProposal,
              "bodyMarkdown",
              stringValue(payload, "bodyMarkdown", ""),
            ),
            structuredData: knowledgeProposal.structuredData ?? payload.structuredData ?? {},
            targetKnowledgeSourceId: stringValue(
              knowledgeProposal,
              "targetKnowledgeSourceId",
              stringValue(payload, "targetKnowledgeSourceId", ""),
            ),
            targetCompiledNoteId: stringValue(
              knowledgeProposal,
              "targetCompiledNoteId",
              stringValue(payload, "targetCompiledNoteId", ""),
            ),
          },
        },
        context,
        null,
      );
      return;
    }

    if (item.actionType === "upsert_compiled_note" || item.actionType === "upsert_knowledge") {
      const title = stringValue(payload, "title", "Untitled Note");
      const structuredData = payload.structuredData ?? {};
      const bodyMarkdown = hasKnowledgeFacets(structuredData)
        ? renderKnowledgeFacetsMarkdown(structuredData, stringValue(payload, "bodyMarkdown"))
        : stringValue(payload, "bodyMarkdown");
      const noteType = stringValue(
        payload,
        "noteType",
        stringValue(payload, "knowledgeType", "note"),
      );
      const targetCompiledNoteId = stringValue(payload, "targetCompiledNoteId") || null;
      const targetKnowledgeSourceId = stringValue(payload, "targetKnowledgeSourceId") || null;
      const compiledNote = await this.knowledgeRepository.upsertCompiledNote({
        userId: proposal.userId,
        targetCompiledNoteId,
        domain: stringValue(payload, "domain", "coding"),
        noteType,
        title,
        bodyMarkdown,
        structuredData,
      });
      context.compiledNoteByTitle.set(normalizedTitle(compiledNote.title), compiledNote);

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

      const knowledgeSnapshot = await this.knowledgeRepository.upsertKnowledgeSourceVersion({
        userId: proposal.userId,
        targetKnowledgeSourceId,
        domain: compiledNote.domain,
        knowledgeType: compiledNote.noteType,
        title: compiledNote.title,
        bodyMarkdown: compiledNote.bodyMarkdown,
        structuredData: compiledNote.structuredData,
        compiledNoteId: compiledNote.id,
        proposalId: proposal.id,
        changeSummary: item.rationale ?? proposal.rationale,
        blocks: chunkKnowledgeMarkdown(compiledNote.bodyMarkdown),
      });
      await this.embedSnapshotBlocks(knowledgeSnapshot.blocks);

      await this.knowledgeRepository.createEvidenceLink({
        userId: proposal.userId,
        sourceType: "raw_note",
        sourceId: proposal.rawNoteId ?? proposal.id,
        targetType: "knowledge_version",
        targetId: knowledgeSnapshot.version.id,
        confidence: proposal.confidence,
        impactLevel: proposal.impactLevel,
        approvalStatus: "approved",
      });

      if (proposal.rawNoteId) {
        await this.knowledgeRepository.createEvidenceLinksFromRawNoteChunks({
          userId: proposal.userId,
          rawNoteId: proposal.rawNoteId,
          targetType: "knowledge_version",
          targetId: knowledgeSnapshot.version.id,
          confidence: proposal.confidence,
          impactLevel: proposal.impactLevel,
          approvalStatus: "approved",
        });
      }

      const structuredDataRecord = asRecord(structuredData);
      const concepts = Array.isArray(structuredDataRecord.concepts) ? structuredDataRecord.concepts : [];
      for (const concept of concepts) {
        const conceptRecord = asRecord(concept);
        const name = stringValue(conceptRecord, "name");
        const conceptType = stringValue(conceptRecord, "conceptType", stringValue(conceptRecord, "type", "topic"));
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

      // Related links are no longer created blindly here (#98): the agent judges
      // candidates in the compile loop and emits explicit create_link items.
      return;
    }

    if (item.actionType === "create_link") {
      const sourceNoteType = stringValue(payload, "sourceNoteType", "compiled_note");
      const sourceNoteId =
        stringValue(payload, "sourceNoteId") ||
        context.compiledNoteByTitle.get(normalizedTitle(stringValue(payload, "sourceTitle")))?.id ||
        "";
      const targetNoteType = stringValue(payload, "targetNoteType", "compiled_note");
      const targetNoteId = stringValue(payload, "targetNoteId");

      if (!sourceNoteId || !targetNoteId) {
        return;
      }

      await this.noteLinkRepository.createSuggestion({
        userId: proposal.userId,
        sourceNoteType,
        sourceNoteId,
        targetNoteType,
        targetNoteId,
        relationType: stringValue(payload, "relationType", "related_concept"),
        confidence: confidenceValue(payload.confidence, proposal.confidence),
        rationale: item.rationale ?? (stringValue(payload, "rationale") || null),
      });
      return;
    }

    if (["create_mistake", "create_review_task", "upsert_readiness"].includes(item.actionType)) {
      return;
    }
  }

  private async embedSnapshotBlocks(blocks: { id: string; heading?: string | null; bodyMarkdown: string }[]) {
    for (const block of blocks) {
      const embedding = await embedKnowledgeBlock(this.embeddingService, block);
      if (embedding) {
        await this.knowledgeRepository.updateKnowledgeBlockEmbedding(block.id, embedding);
      }
    }
  }

}
