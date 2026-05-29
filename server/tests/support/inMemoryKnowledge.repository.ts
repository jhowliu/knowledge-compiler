import type {
  CompiledNote,
  Concept,
  CreateKnowledgeBlockInput,
  KnowledgeBlock,
  KnowledgeBlockSearchResult,
  KnowledgeEvidenceReference,
  KnowledgeSource,
  KnowledgeSourceSnapshot,
  KnowledgeSourceTimeline,
  KnowledgeVersion,
  Mistake,
  ReadinessItem,
  ReviewTask,
  SearchResult,
} from "../../src/domain/knowledge.js";
import type { KnowledgeRepository } from "../../src/repositories/knowledge.repository.js";

type EvidenceLinkRecord = {
  id: string;
  userId: string | null;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  confidence: string;
  impactLevel: number;
  approvalStatus: string;
  createdAt: Date;
};

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  readonly concepts: Concept[] = [];
  readonly compiledNotes: CompiledNote[] = [];
  readonly knowledgeSources: KnowledgeSource[] = [];
  readonly knowledgeVersions: KnowledgeVersion[] = [];
  readonly knowledgeBlocks: KnowledgeBlock[] = [];
  readonly mistakes: Mistake[] = [];
  readonly reviewTasks: ReviewTask[] = [];
  readonly readinessItems: ReadinessItem[] = [];
  readonly evidenceLinks: EvidenceLinkRecord[] = [];
  readonly rawNoteChunkIdsByRawNoteId = new Map<string, string[]>();
  relatedResults: SearchResult[] = [];

  async upsertConcept(input: {
    userId?: string | null;
    name: string;
    conceptType: string;
  }): Promise<Concept> {
    const concept: Concept = {
      id: `concept-${this.concepts.length + 1}`,
      userId: input.userId ?? null,
      name: input.name,
      normalizedName: input.name.toLowerCase(),
      conceptType: input.conceptType,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.concepts.push(concept);
    return concept;
  }

  async indexConcept(): Promise<void> {}

  async searchRelated(): Promise<SearchResult[]> {
    return this.relatedResults;
  }

  async searchKnowledgeBlocks(input: {
    query: string;
    limit: number;
    includeArchived?: boolean;
  }): Promise<KnowledgeBlockSearchResult[]> {
    const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = this.knowledgeBlocks
      .filter((block) => input.includeArchived || block.status === "active")
      .map((block) => {
        const source = this.knowledgeSources.find((item) => item.id === block.knowledgeSourceId);
        const version = this.knowledgeVersions.find((item) => item.id === block.knowledgeVersionId);
        const haystack = `${source?.title ?? ""} ${block.heading ?? ""} ${block.bodyMarkdown}`.toLowerCase();
        const rank = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
        return { block, source, version, rank };
      })
      .filter((item) => item.source && item.version && item.source.status === "active" && item.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, input.limit);

    return matches.map(({ block, source, version, rank }) => {
      const evidenceReferences = this.evidenceLinks
        .filter(
          (link) =>
            link.approvalStatus === "approved" &&
            ((link.targetType === "knowledge_block" && link.targetId === block.id) ||
              (link.targetType === "knowledge_version" && link.targetId === block.knowledgeVersionId) ||
              (link.targetType === "knowledge_source" && link.targetId === block.knowledgeSourceId)),
        )
        .map((link): KnowledgeEvidenceReference => ({
          id: link.id,
          sourceType: link.sourceType,
          sourceId: link.sourceId,
          sourceTitle: null,
          rawSourceId: link.sourceType === "raw_source" ? link.sourceId : null,
          rawSourceTitle: null,
          rawSourceChunkId: link.sourceType === "raw_source_chunk" ? link.sourceId : null,
          chunkIndex: null,
          chunkHeading: null,
          chunkBodyMarkdown: null,
          confidence: link.confidence,
          impactLevel: link.impactLevel,
          createdAt: link.createdAt,
        }));

      return {
        blockId: block.id,
        knowledgeSourceId: block.knowledgeSourceId,
        knowledgeVersionId: block.knowledgeVersionId,
        title: source?.title ?? "Untitled",
        domain: source?.domain ?? "general",
        knowledgeType: source?.knowledgeType ?? "note",
        versionNumber: version?.versionNumber ?? 1,
        blockIndex: block.blockIndex,
        heading: block.heading,
        bodyMarkdown: block.bodyMarkdown,
        rank,
        status: block.status,
        updatedAt: block.updatedAt,
        evidenceReferences,
      };
    });
  }

  async upsertCompiledNote(input: {
    userId?: string | null;
    domain: string;
    noteType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
  }): Promise<CompiledNote> {
    const note: CompiledNote = {
      id: `compiled-${this.compiledNotes.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      noteType: input.noteType,
      title: input.title,
      bodyMarkdown: input.bodyMarkdown,
      structuredData: input.structuredData,
      status: "active",
      lastReviewedAt: null,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.compiledNotes.push(note);
    return note;
  }

  async listCompiledNotes(): Promise<CompiledNote[]> {
    return this.compiledNotes;
  }

  async listReviewMaps(): Promise<CompiledNote[]> {
    return this.compiledNotes.filter((note) => note.noteType === "review_map");
  }

  async upsertKnowledgeSourceVersion(input: {
    userId?: string | null;
    domain: string;
    knowledgeType: string;
    title: string;
    bodyMarkdown: string;
    structuredData: unknown;
    compiledNoteId?: string | null;
    proposalId?: string | null;
    changeSummary?: string | null;
    blocks: CreateKnowledgeBlockInput[];
  }): Promise<KnowledgeSourceSnapshot> {
    let source = this.knowledgeSources.find(
      (item) =>
        item.userId === (input.userId ?? null) &&
        item.domain === input.domain &&
        item.knowledgeType === input.knowledgeType &&
        item.title.toLowerCase() === input.title.toLowerCase() &&
        item.status === "active",
    );

    if (!source) {
      source = {
        id: `knowledge-source-${this.knowledgeSources.length + 1}`,
        userId: input.userId ?? null,
        domain: input.domain,
        knowledgeType: input.knowledgeType,
        title: input.title,
        status: "active",
        currentVersionId: null,
        metadata: {},
        createdAt: new Date("2026-05-24T00:00:00.000Z"),
        updatedAt: new Date("2026-05-24T00:00:00.000Z"),
      };
      this.knowledgeSources.push(source);
    }

    const version: KnowledgeVersion = {
      id: `knowledge-version-${this.knowledgeVersions.length + 1}`,
      knowledgeSourceId: source.id,
      compiledNoteId: input.compiledNoteId ?? null,
      proposalId: input.proposalId ?? null,
      versionNumber:
        this.knowledgeVersions.filter((item) => item.knowledgeSourceId === source.id).length + 1,
      title: input.title,
      bodyMarkdown: input.bodyMarkdown,
      structuredData: input.structuredData,
      changeSummary: input.changeSummary ?? null,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.knowledgeVersions.push(version);
    source.currentVersionId = version.id;
    source.updatedAt = new Date("2026-05-24T00:00:00.000Z");

    for (const block of this.knowledgeBlocks) {
      if (block.knowledgeSourceId === source.id && block.status === "active") {
        block.status = "archived";
      }
    }

    const blocks = input.blocks.map((block) => {
      const savedBlock: KnowledgeBlock = {
        id: `knowledge-block-${this.knowledgeBlocks.length + 1}`,
        knowledgeSourceId: source.id,
        knowledgeVersionId: version.id,
        blockIndex: block.blockIndex,
        heading: block.heading ?? null,
        bodyMarkdown: block.bodyMarkdown,
        tokenEstimate: block.tokenEstimate,
        status: "active",
        metadata: block.metadata ?? {},
        createdAt: new Date("2026-05-24T00:00:00.000Z"),
        updatedAt: new Date("2026-05-24T00:00:00.000Z"),
      };
      this.knowledgeBlocks.push(savedBlock);
      return savedBlock;
    });

    return { source, version, blocks };
  }

  async listActiveKnowledgeBlocks(): Promise<KnowledgeBlock[]> {
    return this.knowledgeBlocks.filter((block) => block.status === "active");
  }

  async getKnowledgeSourceTimeline(id: string): Promise<KnowledgeSourceTimeline | null> {
    const source = this.knowledgeSources.find((item) => item.id === id) ?? null;
    return source ? this.buildKnowledgeSourceTimeline(source) : null;
  }

  async getKnowledgeSourceTimelineByCompiledNoteId(id: string): Promise<KnowledgeSourceTimeline | null> {
    const version = [...this.knowledgeVersions].reverse().find((item) => item.compiledNoteId === id) ?? null;
    const source = version
      ? this.knowledgeSources.find((item) => item.id === version.knowledgeSourceId) ?? null
      : null;
    return source ? this.buildKnowledgeSourceTimeline(source) : null;
  }

  async upsertMistake(input: {
    userId?: string | null;
    domain: string;
    category?: string | null;
    title: string;
    description: string;
  }): Promise<Mistake> {
    const mistake: Mistake = {
      id: `mistake-${this.mistakes.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      category: input.category ?? null,
      title: input.title,
      description: input.description,
      status: "active",
      evidenceCount: 1,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.mistakes.push(mistake);
    return mistake;
  }

  async listMistakes(): Promise<Mistake[]> {
    return this.mistakes;
  }

  async createReviewTask(input: {
    userId?: string | null;
    domain: string;
    title: string;
    description: string;
    sourceType?: string | null;
    sourceId?: string | null;
  }): Promise<ReviewTask> {
    const task: ReviewTask = {
      id: `task-${this.reviewTasks.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      title: input.title,
      description: input.description,
      status: "open",
      dueAt: null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.reviewTasks.push(task);
    return task;
  }

  async listReviewTasks(): Promise<ReviewTask[]> {
    return this.reviewTasks;
  }

  async completeReviewTask(id: string): Promise<ReviewTask | null> {
    const task = this.reviewTasks.find((item) => item.id === id) ?? null;
    if (task) {
      task.status = "completed";
    }
    return task;
  }

  async upsertReadinessItem(input: {
    userId?: string | null;
    domain: string;
    area: string;
    status: "Missing" | "Weak" | "Needs Review" | "Okay" | "Strong";
    rationale: string;
  }): Promise<ReadinessItem> {
    const item: ReadinessItem = {
      id: `readiness-${this.readinessItems.length + 1}`,
      userId: input.userId ?? null,
      domain: input.domain,
      area: input.area,
      status: input.status,
      rationale: input.rationale,
      lastEvidenceAt: new Date("2026-05-24T00:00:00.000Z"),
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
      updatedAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    this.readinessItems.push(item);
    return item;
  }

  async listReadinessItems(): Promise<ReadinessItem[]> {
    return this.readinessItems;
  }

  async createEvidenceLink(input: {
    userId?: string | null;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    confidence: string;
    impactLevel: number;
    approvalStatus: string;
  }): Promise<void> {
    this.evidenceLinks.push({
      id: `evidence-${this.evidenceLinks.length + 1}`,
      userId: input.userId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      confidence: input.confidence,
      impactLevel: input.impactLevel,
      approvalStatus: input.approvalStatus,
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    });
  }

  async createEvidenceLinksFromRawNoteChunks(input: {
    userId?: string | null;
    rawNoteId: string;
    targetType: string;
    targetId: string;
    confidence: string;
    impactLevel: number;
    approvalStatus: string;
  }): Promise<number> {
    const chunkIds = this.rawNoteChunkIdsByRawNoteId.get(input.rawNoteId) ?? [];
    for (const chunkId of chunkIds) {
      await this.createEvidenceLink({
        userId: input.userId,
        sourceType: "raw_source_chunk",
        sourceId: chunkId,
        targetType: input.targetType,
        targetId: input.targetId,
        confidence: input.confidence,
        impactLevel: input.impactLevel,
        approvalStatus: input.approvalStatus,
      });
    }
    return chunkIds.length;
  }

  private buildKnowledgeSourceTimeline(source: KnowledgeSource): KnowledgeSourceTimeline {
    const versions = this.knowledgeVersions
      .filter((version) => version.knowledgeSourceId === source.id)
      .sort((a, b) => b.versionNumber - a.versionNumber);

    return {
      source,
      sourceEvidenceReferences: this.evidenceReferencesForTarget("knowledge_source", source.id),
      versions: versions.map((version) => {
        const blocks = this.knowledgeBlocks
          .filter((block) => block.knowledgeVersionId === version.id)
          .sort((a, b) => a.blockIndex - b.blockIndex);
        const isCurrent = version.id === source.currentVersionId;
        return {
          ...version,
          isCurrent,
          state: isCurrent ? "current" : "historical",
          blocks,
          evidenceReferences: [
            ...this.evidenceReferencesForTarget("knowledge_version", version.id),
            ...blocks.flatMap((block) => this.evidenceReferencesForTarget("knowledge_block", block.id)),
          ],
        };
      }),
    };
  }

  private evidenceReferencesForTarget(targetType: string, targetId: string): KnowledgeEvidenceReference[] {
    return this.evidenceLinks
      .filter(
        (link) =>
          link.approvalStatus === "approved" &&
          link.targetType === targetType &&
          link.targetId === targetId,
      )
      .map((link): KnowledgeEvidenceReference => ({
        id: link.id,
        sourceType: link.sourceType,
        sourceId: link.sourceId,
        sourceTitle: null,
        rawSourceId: link.sourceType === "raw_source" ? link.sourceId : null,
        rawSourceTitle: null,
        rawSourceChunkId: link.sourceType === "raw_source_chunk" ? link.sourceId : null,
        chunkIndex: null,
        chunkHeading: null,
        chunkBodyMarkdown: null,
        confidence: link.confidence,
        impactLevel: link.impactLevel,
        createdAt: link.createdAt,
      }));
  }
}
