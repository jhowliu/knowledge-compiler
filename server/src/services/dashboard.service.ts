import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import { KnowledgeRetrievalService } from "./knowledgeRetrieval.service.js";

export class DashboardService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly knowledgeRetrievalService = new KnowledgeRetrievalService(knowledgeRepository),
  ) {}

  async listCompiledNotes() {
    return this.knowledgeRepository.listCompiledNotes(50);
  }

  async search(
    query: string,
    options: { includeArchived?: boolean; limit?: number; topicIds?: string[] } = {},
  ) {
    return this.knowledgeRetrievalService.search({
      query,
      includeArchived: options.includeArchived,
      limit: options.limit ?? 20,
      topicIds: options.topicIds,
    });
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
