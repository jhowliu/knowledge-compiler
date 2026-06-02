import type { CompiledNote, Confidence, ProposalItem, ProposalWithItems } from "../domain/knowledge.js";
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

type ApplyContext = {
  compiledNoteByTitle: Map<string, CompiledNote>;
};

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

  async approveProposal(id: string) {
    const proposal = await this.getProposal(id);
    if (proposal.status !== "pending") {
      return proposal;
    }

    const context: ApplyContext = { compiledNoteByTitle: new Map() };
    for (const item of proposal.items) {
      await this.applyItem(proposal, item, context);
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

  private async applyItem(proposal: ProposalWithItems, item: ProposalItem, context: ApplyContext) {
    const payload = asRecord(item.payload);

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
      const compiledNote = await this.knowledgeRepository.upsertCompiledNote({
        userId: proposal.userId,
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
      const conceptNames: string[] = [];
      for (const concept of concepts) {
        const conceptRecord = asRecord(concept);
        const name = stringValue(conceptRecord, "name");
        const conceptType = stringValue(conceptRecord, "conceptType", stringValue(conceptRecord, "type", "topic"));
        if (!name) {
          continue;
        }
        conceptNames.push(name);
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

      await this.suggestLinksForCompiledNote({
        proposal,
        compiledNoteId: compiledNote.id,
        title: compiledNote.title,
        bodyMarkdown: compiledNote.bodyMarkdown,
        conceptNames,
      });
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

  private async suggestLinksForCompiledNote(input: {
    proposal: ProposalWithItems;
    compiledNoteId: string;
    title: string;
    bodyMarkdown: string;
    conceptNames: string[];
  }) {
    const relatedNotes = await this.knowledgeRepository.searchRelated({
      query: `${input.title}\n${input.bodyMarkdown}`,
      conceptNames: input.conceptNames,
      limit: 8,
    });

    const compiledMatches = relatedNotes
      .filter((note) => note.targetType === "compiled_note" && note.id !== input.compiledNoteId)
      .slice(0, 4);

    for (const match of compiledMatches) {
      await this.noteLinkRepository.createSuggestion({
        userId: input.proposal.userId,
        sourceNoteType: "compiled_note",
        sourceNoteId: input.compiledNoteId,
        targetNoteType: "compiled_note",
        targetNoteId: match.id,
        relationType: "related_concept",
        confidence: input.proposal.confidence,
        rationale: match.title
          ? `Agent found overlap with "${match.title}" while applying proposal ${input.proposal.id}.`
          : `Agent found concept overlap while applying proposal ${input.proposal.id}.`,
      });
    }
  }
}
