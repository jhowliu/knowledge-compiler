import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";

export type KnowledgeSearchInput = {
  query: string;
  limit?: number;
  includeArchived?: boolean;
  topicIds?: string[];
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
      topicIds: input.topicIds ?? [],
    });
  }
}
