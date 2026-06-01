import request from "supertest";
import { createApp } from "../src/app.js";
import type { CreateTopicInput, Topic, UpdateTopicInput } from "../src/domain/topic.js";
import type { TopicRepository } from "../src/repositories/topic.repository.js";

class InMemoryTopicRepository implements TopicRepository {
  readonly topics: Topic[] = [];
  readonly referencedTopicIds = new Set<string>();

  async list(userId?: string | null) {
    return this.topics
      .filter((topic) => topic.userId === (userId ?? null))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string) {
    return this.topics.find((topic) => topic.id === id) ?? null;
  }

  async create(input: CreateTopicInput) {
    const topic: Topic = {
      id: `00000000-0000-4000-8000-${String(this.topics.length + 1).padStart(12, "0")}`,
      userId: input.userId ?? null,
      name: input.name,
      color: input.color ?? null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    };
    this.topics.push(topic);
    return topic;
  }

  async update(id: string, input: UpdateTopicInput) {
    const topic = await this.getById(id);
    if (!topic) {
      return null;
    }
    topic.name = input.name ?? topic.name;
    topic.color = Object.hasOwn(input, "color") ? (input.color ?? null) : topic.color;
    return topic;
  }

  async delete(id: string) {
    if (this.referencedTopicIds.has(id)) {
      return "referenced" as const;
    }
    const index = this.topics.findIndex((topic) => topic.id === id);
    if (index === -1) {
      return false;
    }
    this.topics.splice(index, 1);
    return true;
  }
}

describe("topic routes", () => {
  test("creates, lists, updates, and deletes topics", async () => {
    const topicRepository = new InMemoryTopicRepository();
    const app = createApp({
      topicRepository,
      enablePhaseOneWorkflow: false,
    });

    const createResponse = await request(app).post("/topics").send({
      name: "Machine Learning",
      color: "#705CFF",
    });
    const listResponse = await request(app).get("/topics");
    const updateResponse = await request(app).patch(`/topics/${createResponse.body.topic.id}`).send({
      name: "ML Papers",
      color: "#14B8A6",
    });
    const deleteResponse = await request(app).delete(`/topics/${createResponse.body.topic.id}`);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.topic).toMatchObject({
      name: "Machine Learning",
      color: "#705CFF",
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.topics).toEqual([
      expect.objectContaining({ id: createResponse.body.topic.id, name: "Machine Learning" }),
    ]);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.topic).toMatchObject({
      id: createResponse.body.topic.id,
      name: "ML Papers",
      color: "#14B8A6",
    });
    expect(deleteResponse.status).toBe(204);
    expect(topicRepository.topics).toHaveLength(0);
  });

  test("rejects duplicate topic names for the same user", async () => {
    const app = createApp({
      topicRepository: new InMemoryTopicRepository(),
      enablePhaseOneWorkflow: false,
    });

    await request(app).post("/topics").send({ name: "Research" });
    const response = await request(app).post("/topics").send({ name: "research" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Topic already exists");
  });

  test("DELETE /topics/:id returns 409 when a source or block references the topic", async () => {
    const topicRepository = new InMemoryTopicRepository();
    const app = createApp({
      topicRepository,
      enablePhaseOneWorkflow: false,
    });
    const createResponse = await request(app).post("/topics").send({ name: "Graph Theory" });
    topicRepository.referencedTopicIds.add(createResponse.body.topic.id);

    const response = await request(app).delete(`/topics/${createResponse.body.topic.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Topic is referenced by sources or blocks");
  });
});
