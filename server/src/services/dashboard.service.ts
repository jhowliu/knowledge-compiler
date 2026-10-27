import { AppError } from "../domain/errors.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";

export class DashboardService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly rawSourceRepository: RawSourceRepository | null = null,
  ) {}

  async listCompiledNotes() {
    return this.knowledgeRepository.listCompiledNotes(50);
  }

  // Two-tier search (#143): canonical knowledge blocks first, then raw sources
  // (tagged so the caller can show provenance). Sources stay verbatim and are
  // surfaced here so kept_searchable material is actually findable.
  async search(
    query: string,
    options: { includeArchived?: boolean; limit?: number } = {},
  ) {
    const queryText = query.trim();
    const limit = options.limit ?? 20;
    if (!queryText) {
      return [];
    }

    const knowledge = await this.knowledgeRepository.searchKnowledgeBlocks({
      query: queryText,
      limit,
      includeArchived: options.includeArchived ?? false,
    });
    const knowledgeHits = knowledge.map((hit) => ({ ...hit, tier: "knowledge" as const }));

    let sourceHits: Array<Record<string, unknown> & { tier: "source" }> = [];
    if (this.rawSourceRepository) {
      const sources = await this.rawSourceRepository.searchRawSourceChunks({
        query: queryText,
        limit,
      });
      sourceHits = sources.map((hit) => ({ ...hit, tier: "source" as const }));
    }

    return [...knowledgeHits, ...sourceHits].slice(0, limit);
  }

  async getKnowledgeSourceTimeline(id: string) {
    const timeline = await this.knowledgeRepository.getKnowledgeSourceTimeline(id);
    if (!timeline) {
      throw new AppError("Knowledge source timeline not found", 404);
    }
    return timeline;
  }

  async getCompiledNoteTimeline(id: string) {
    const timeline = await this.knowledgeRepository.getKnowledgeSourceTimelineByCompiledNoteId(id);
    if (!timeline) {
      throw new AppError("Knowledge source timeline not found", 404);
    }
    return timeline;
  }
}
