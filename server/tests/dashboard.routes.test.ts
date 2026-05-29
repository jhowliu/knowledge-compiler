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

  test("GET /search returns active knowledge blocks with evidence references", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const snapshot = await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "LLM Agent Memory",
      bodyMarkdown: "Agent memory should retrieve approved knowledge blocks.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Memory retrieval",
          bodyMarkdown: "Retrieve active knowledge blocks instead of raw chunks.",
          tokenEstimate: 12,
        },
      ],
    });
    await knowledgeRepository.createEvidenceLink({
      sourceType: "raw_source_chunk",
      sourceId: "raw-source-chunk-1",
      targetType: "knowledge_version",
      targetId: snapshot.version.id,
      confidence: "high",
      impactLevel: 1,
      approvalStatus: "approved",
    });

    const app = createApp({ knowledgeRepository, enablePhaseOneWorkflow: false });
    const response = await request(app).get("/search?q=knowledge%20blocks");

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toMatchObject({
      blockId: snapshot.blocks[0].id,
      title: "LLM Agent Memory",
      bodyMarkdown: "Retrieve active knowledge blocks instead of raw chunks.",
      evidenceReferences: [
        expect.objectContaining({
          sourceType: "raw_source_chunk",
          sourceId: "raw-source-chunk-1",
          rawSourceChunkId: "raw-source-chunk-1",
        }),
      ],
    });
  });

  test("GET /search excludes archived knowledge blocks unless requested", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Retrieval Design",
      bodyMarkdown: "Old stale retrieval detail.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Old retrieval",
          bodyMarkdown: "stale-source-only",
          tokenEstimate: 3,
        },
      ],
    });
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Retrieval Design",
      bodyMarkdown: "Current retrieval detail.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Current retrieval",
          bodyMarkdown: "fresh-source-only",
          tokenEstimate: 3,
        },
      ],
    });

    const app = createApp({ knowledgeRepository, enablePhaseOneWorkflow: false });
    const defaultResponse = await request(app).get("/search?q=stale-source-only");
    const archivedResponse = await request(app).get("/search?q=stale-source-only&includeArchived=true");

    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.body.results).toHaveLength(0);
    expect(archivedResponse.status).toBe(200);
    expect(archivedResponse.body.results).toHaveLength(1);
    expect(archivedResponse.body.results[0]).toMatchObject({
      heading: "Old retrieval",
      status: "archived",
    });
  });
});
