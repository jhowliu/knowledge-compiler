import { AppError } from "../domain/errors.js";
import type { CreateTopicInput, UpdateTopicInput } from "../domain/topic.js";
import type { TopicRepository } from "../repositories/topic.repository.js";

export class TopicService {
  constructor(private readonly topicRepository: TopicRepository) {}

  async listTopics(userId?: string | null) {
    return this.topicRepository.list(userId);
  }

  async createTopic(input: CreateTopicInput) {
    const existingTopic = (await this.topicRepository.list(input.userId ?? null)).find(
      (topic) => topic.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
    );
    if (existingTopic) {
      throw new AppError("Topic already exists", 409);
    }
    return this.topicRepository.create(input);
  }

  async updateTopic(id: string, input: UpdateTopicInput) {
    if (input.name) {
      const currentTopic = await this.topicRepository.getById(id);
      if (!currentTopic) {
        throw new AppError("Topic not found", 404);
      }
      const duplicateTopic = (await this.topicRepository.list(currentTopic.userId)).find(
        (topic) =>
          topic.id !== id &&
          topic.name.trim().toLowerCase() === input.name?.trim().toLowerCase(),
      );
      if (duplicateTopic) {
        throw new AppError("Topic already exists", 409);
      }
    }
    const topic = await this.topicRepository.update(id, input);
    if (!topic) {
      throw new AppError("Topic not found", 404);
    }
    return topic;
  }

  async deleteTopic(id: string) {
    const result = await this.topicRepository.delete(id);
    if (result === "referenced") {
      throw new AppError("Topic is referenced by sources or blocks", 409);
    }
    if (!result) {
      throw new AppError("Topic not found", 404);
    }
  }
}
