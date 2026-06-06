import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

describe("dashboard routes", () => {
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

    const app = createApp({ knowledgeRepository });
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

    const app = createApp({ knowledgeRepository });
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

  test("GET /search can retrieve blocks through embedding similarity", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const snapshot = await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Attention Mechanisms",
      bodyMarkdown: "Query and key vectors choose which tokens to attend to.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Attention",
          bodyMarkdown: "Query and key vectors choose which tokens to attend to.",
          tokenEstimate: 10,
        },
      ],
    });
    await knowledgeRepository.updateKnowledgeBlockEmbedding(snapshot.blocks[0].id, [1, 0, 0]);

    const app = createApp({
      knowledgeRepository,
      embeddingService: {
        async embedText() {
          return [1, 0, 0];
        },
      },
    });
    const response = await request(app).get("/search?q=semantic-neighbor");

    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      blockId: snapshot.blocks[0].id,
      title: "Attention Mechanisms",
    });
  });

  test("GET /search surfaces raw sources as a labeled source tier, knowledge first (#143)", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Vector Search",
      bodyMarkdown: "Vector search retrieves by meaning.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Overview",
          bodyMarkdown: "Vector search retrieves approved knowledge by meaning.",
          tokenEstimate: 9,
        },
      ],
    });

    const rawSourceRepository = new InMemoryRawSourceRepository();
    await rawSourceRepository.create(
      {
        bodyMarkdown: "Meeting notes: revisit vector search rollout next sprint.",
        title: "Sync notes",
        sourceRole: "personal_note",
      },
      [
        {
          chunkIndex: 0,
          heading: "Notes",
          bodyMarkdown: "Meeting notes: revisit vector search rollout next sprint.",
          tokenEstimate: 9,
        },
      ],
    );

    const app = createApp({ knowledgeRepository, rawSourceRepository });
    const response = await request(app).get("/search?q=vector%20search");

    expect(response.status).toBe(200);
    const tiers = response.body.results.map((result: { tier: string }) => result.tier);
    expect(tiers).toContain("knowledge");
    expect(tiers).toContain("source");
    // Knowledge is canonical, so it ranks ahead of the raw source.
    expect(response.body.results[0].tier).toBe("knowledge");

    const sourceHit = response.body.results.find(
      (result: { tier: string }) => result.tier === "source",
    );
    expect(sourceHit).toMatchObject({
      title: "Sync notes",
      sourceRole: "personal_note",
      bodyMarkdown: "Meeting notes: revisit vector search rollout next sprint.",
    });
    expect(typeof sourceHit.rawSourceId).toBe("string");
  });

  test("GET /knowledge-sources/:id/timeline returns versions and source evidence", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const first = await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Agent Memory",
      bodyMarkdown: "Initial memory note.",
      structuredData: {},
      proposalId: "proposal-1",
      blocks: [
        {
          blockIndex: 0,
          heading: "Initial",
          bodyMarkdown: "Memory starts with indexed observations.",
          tokenEstimate: 6,
        },
      ],
    });
    const second = await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Agent Memory",
      bodyMarkdown: "Updated memory note.",
      structuredData: {},
      proposalId: "proposal-2",
      blocks: [
        {
          blockIndex: 0,
          heading: "Updated",
          bodyMarkdown: "Memory evolves from approved source evidence.",
          tokenEstimate: 7,
        },
      ],
    });
    await knowledgeRepository.createEvidenceLink({
      sourceType: "raw_source_chunk",
      sourceId: "raw-source-chunk-1",
      targetType: "knowledge_version",
      targetId: first.version.id,
      confidence: "high",
      impactLevel: 1,
      approvalStatus: "approved",
    });
    await knowledgeRepository.createEvidenceLink({
      sourceType: "raw_source_chunk",
      sourceId: "raw-source-chunk-2",
      targetType: "knowledge_version",
      targetId: second.version.id,
      confidence: "high",
      impactLevel: 2,
      approvalStatus: "approved",
    });

    const app = createApp({ knowledgeRepository });
    const response = await request(app).get(`/knowledge-sources/${first.source.id}/timeline`);

    expect(response.status).toBe(200);
    expect(response.body.timeline.source).toMatchObject({
      id: first.source.id,
      title: "Agent Memory",
    });
    expect(response.body.timeline.versions).toHaveLength(2);
    expect(response.body.timeline.versions[0]).toMatchObject({
      id: second.version.id,
      versionNumber: 2,
      state: "current",
      isCurrent: true,
      proposalId: "proposal-2",
      evidenceReferences: [expect.objectContaining({ sourceId: "raw-source-chunk-2" })],
    });
    expect(response.body.timeline.versions[1]).toMatchObject({
      id: first.version.id,
      versionNumber: 1,
      state: "historical",
      isCurrent: false,
      proposalId: "proposal-1",
      evidenceReferences: [expect.objectContaining({ sourceId: "raw-source-chunk-1" })],
    });
  });

  test("GET /compiled-notes/:id/timeline resolves the backing knowledge source", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const compiledNote = await knowledgeRepository.upsertCompiledNote({
      domain: "research",
      noteType: "paper_note",
      title: "Compiled Memory",
      bodyMarkdown: "Compiled note.",
      structuredData: {},
    });
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Compiled Memory",
      bodyMarkdown: "Compiled note.",
      structuredData: {},
      compiledNoteId: compiledNote.id,
      blocks: [
        {
          blockIndex: 0,
          heading: "Compiled",
          bodyMarkdown: "Compiled note.",
          tokenEstimate: 3,
        },
      ],
    });

    const app = createApp({ knowledgeRepository });
    const response = await request(app).get(`/compiled-notes/${compiledNote.id}/timeline`);

    expect(response.status).toBe(200);
    expect(response.body.timeline.source.title).toBe("Compiled Memory");
    expect(response.body.timeline.versions[0]).toMatchObject({
      compiledNoteId: compiledNote.id,
      isCurrent: true,
    });
  });

  test("legacy review endpoints are no longer registered", async () => {
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
    });

    await expect(request(app).get("/mistakes")).resolves.toMatchObject({ status: 404 });
    await expect(request(app).get("/review-tasks")).resolves.toMatchObject({ status: 404 });
    await expect(request(app).get("/readiness-map")).resolves.toMatchObject({ status: 404 });
  });
});
