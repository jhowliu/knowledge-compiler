import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";

describe("dashboard routes", () => {
  test("GET /review-maps returns only compiled review maps", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    await knowledgeRepository.upsertCompiledNote({
      domain: "coding",
      noteType: "review_map",
      title: "Shortest Path Decision Guide",
      bodyMarkdown: "Weight = 1 -> BFS",
      structuredData: {},
    });
    await knowledgeRepository.upsertCompiledNote({
      domain: "coding",
      noteType: "problem_note",
      title: "1334. Find the City",
      bodyMarkdown: "Problem note",
      structuredData: {},
    });

    const app = createApp({ knowledgeRepository, enablePhaseOneWorkflow: false });
    const response = await request(app).get("/review-maps");

    expect(response.status).toBe(200);
    expect(response.body.reviewMaps).toHaveLength(1);
    expect(response.body.reviewMaps[0].title).toBe("Shortest Path Decision Guide");
  });
});
