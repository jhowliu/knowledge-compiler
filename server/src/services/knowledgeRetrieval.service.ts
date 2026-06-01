import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import { NoopEmbeddingService, type EmbeddingService } from "./embedding.service.js";

export type KnowledgeSearchInput = {
  query: string;
  limit?: number;
  includeArchived?: boolean;
  topicIds?: string[];
};

export class KnowledgeRetrievalService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly embeddingService: EmbeddingService = new NoopEmbeddingService(),
  ) {}

  async search(input: KnowledgeSearchInput) {
    const query = input.query.trim();
    if (!query) {
      return [];
    }

    const queryEmbedding = await this.embeddingService.embedText(query);
    return this.knowledgeRepository.searchKnowledgeBlocks({
      query,
      limit: input.limit ?? 20,
      includeArchived: input.includeArchived ?? false,
      topicIds: input.topicIds ?? [],
      queryEmbedding,
    });
  }
}
