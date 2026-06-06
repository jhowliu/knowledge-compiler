import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";
import { NoopEmbeddingService, type EmbeddingService } from "./embedding.service.js";
import { NoopQueryConceptResolver, type QueryConceptResolver } from "./queryConcept.service.js";

export class DashboardService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly embeddingService: EmbeddingService = new NoopEmbeddingService(),
    private readonly rawSourceRepository: RawSourceRepository | null = null,
    private readonly queryConceptResolver: QueryConceptResolver = new NoopQueryConceptResolver(),
  ) {}

  async listCompiledNotes() {
    return this.knowledgeRepository.listCompiledNotes(50);
  }

  // Two-tier search (#143): canonical knowledge blocks first, then raw sources
  // (tagged so the caller can show provenance). Sources stay verbatim and are
  // surfaced here so kept_searchable material is actually findable.
  async search(
    query: string,
    options: { includeArchived?: boolean; limit?: number; topicIds?: string[] } = {},
  ) {
    const queryText = query.trim();
    const limit = options.limit ?? 20;
    if (!queryText) {
      return [];
    }

    const [queryEmbedding, resolvedConcepts] = await Promise.all([
      this.embeddingService.embedText(queryText),
      this.queryConceptResolver.resolve({ query: queryText }),
    ]);

    const knowledge = await this.knowledgeRepository.searchKnowledgeBlocks({
      query: queryText,
      limit,
      includeArchived: options.includeArchived ?? false,
      topicIds: options.topicIds ?? [],
      queryEmbedding,
      resolvedConceptIds: resolvedConcepts.map((concept) => concept.conceptId),
    });
    const knowledgeHits = knowledge.map((hit) => ({ ...hit, tier: "knowledge" as const }));

    let sourceHits: Array<Record<string, unknown> & { tier: "source" }> = [];
    if (this.rawSourceRepository) {
      const sources = await this.rawSourceRepository.searchRawSourceChunks({
        query: queryText,
        limit,
        queryEmbedding,
      });
      sourceHits = sources.map((hit) => ({ ...hit, tier: "source" as const }));
    }

    return [...knowledgeHits, ...sourceHits].slice(0, limit);
  }

  async getKnowledgeSourceTimeline(id: string) {
    const timeline = await this.knowledgeRepository.getKnowledgeSourceTimeline(id);
    if (!timeline) {
      throw new Error("Knowledge source timeline not found");
    }
    return timeline;
  }

  async getCompiledNoteTimeline(id: string) {
    const timeline = await this.knowledgeRepository.getKnowledgeSourceTimelineByCompiledNoteId(id);
    if (!timeline) {
      throw new Error("Knowledge source timeline not found");
    }
    return timeline;
  }
}
