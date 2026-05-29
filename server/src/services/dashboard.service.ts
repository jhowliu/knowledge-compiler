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

  async listReviewMaps() {
    return this.knowledgeRepository.listReviewMaps(25);
  }

  async listMistakes() {
    return this.knowledgeRepository.listMistakes(50);
  }

  async listReviewTasks() {
    return this.knowledgeRepository.listReviewTasks(50);
  }

  async completeReviewTask(id: string) {
    const task = await this.knowledgeRepository.completeReviewTask(id);
    if (!task) {
      throw new Error("Review task not found");
    }
    return task;
  }

  async listReadinessItems() {
    return this.knowledgeRepository.listReadinessItems(50);
  }

  async search(query: string, options: { includeArchived?: boolean; limit?: number } = {}) {
    return this.knowledgeRetrievalService.search({
      query,
      includeArchived: options.includeArchived,
      limit: options.limit ?? 20,
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
