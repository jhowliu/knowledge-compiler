import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";

export class DashboardService {
  constructor(private readonly knowledgeRepository: KnowledgeRepository) {}

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

  async search(query: string) {
    return this.knowledgeRepository.searchRelated({
      query,
      conceptNames: [query],
      limit: 20,
    });
  }
}
