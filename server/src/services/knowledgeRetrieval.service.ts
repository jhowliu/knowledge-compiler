import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";

export type KnowledgeSearchInput = {
  query: string;
  limit?: number;
  includeArchived?: boolean;
  domain?: string | null;
  knowledgeType?: string | null;
  sourceRole?: string | null;
};

export class KnowledgeRetrievalService {
  constructor(private readonly knowledgeRepository: KnowledgeRepository) {}

  async search(input: KnowledgeSearchInput) {
    const query = input.query.trim();
    if (!query) {
      return [];
    }

    return this.knowledgeRepository.searchKnowledgeBlocks({
      query,
      limit: input.limit ?? 20,
      includeArchived: input.includeArchived ?? false,
      domain: input.domain ?? null,
      knowledgeType: input.knowledgeType ?? null,
      sourceRole: input.sourceRole ?? null,
    });
  }
}
