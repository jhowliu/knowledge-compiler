import request from "supertest";
import { createApp } from "../src/app.js";
import type { GeneralKnowledgeExtraction } from "../src/domain/compiler.js";
import type { SearchResult } from "../src/domain/knowledge.js";
import type { WikiIndexingSource } from "../src/services/wikiIndexer.service.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

const routeWikiIndexer = {
  async extract() {
    return {
      provider: "openai" as const,
      extraction: {
        domain: "general",
        knowledgeType: "knowledge_note",
        title: "Source-first Indexing",
        outcome: "create_knowledge" as const,
        outcomeReason: "This teaches reusable source-first indexing behavior.",
        structuredData: {
          summary: "Index source chunks before drafting approved knowledge.",
          concepts: [
            {
              name: "Source-first Indexing",
              type: "method",
              specificity: "specific",
              confidence: "high" as const,
            },
          ],
          claims: [
            {
              text: "Index source chunks before drafting approved knowledge.",
              confidence: "high" as const,
              evidenceChunkIds: [],
            },
          ],
          methods: [
            {
              name: "Source compile",
              purpose: "Compile from a source endpoint.",
              steps: ["Compile from /sources/:id/compile."],
              conditions: ["source chunks"],
            },
          ],
          examples: [],
          constraints: [],
          inferredSuggestions: [],
        },
        confidence: "high" as const,
      } satisfies GeneralKnowledgeExtraction,
    };
  },
  draftProposal(
    source: WikiIndexingSource,
    extraction: GeneralKnowledgeExtraction,
    relatedNotes: SearchResult[],
  ) {
    return {
      detectedDomain: extraction.domain,
      detectedKnowledgeType: "knowledge_note",
      impactLevel: 2,
      confidence: extraction.confidence,
      rationale: `Indexed ${source.chunks.length} chunks and ${relatedNotes.length} related notes.`,
      items: [
        {
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: {
            domain: extraction.domain,
            knowledgeType: "knowledge_note",
            title: source.title ?? "Untitled source",
            bodyMarkdown: extraction.structuredData.summary,
            structuredData: { ...extraction.structuredData, rawSourceId: source.rawSourceId },
          },
          rationale: "Create approved knowledge from this source.",
        },
      ],
    };
  },
};

describe("raw source routes", () => {
  test("POST /sources stores a reference source with chunks", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
    });

    const response = await request(app).post("/sources").send({
      sourceRole: "reference",
      sourceType: "paper",
      subtype: "research_paper",
      title: "Attention Is All You Need",
      bodyMarkdown: "# Transformer\n\nSelf-attention replaces recurrence.",
    });

    expect(response.status).toBe(201);
    expect(response.body.rawSource).toMatchObject({
      sourceRole: "reference",
      sourceType: "paper",
      subtype: "research_paper",
      title: "Attention Is All You Need",
    });
    expect(response.body.rawSource.chunks).toHaveLength(1);
    expect(response.body.rawSource.chunks[0]).toMatchObject({
      chunkIndex: 0,
      heading: "Transformer",
    });
  });

  test("PATCH /sources/:id updates subtype", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
    });
    const createResponse = await request(app).post("/sources").send({
      sourceRole: "personal_note",
      sourceType: "manual",
      subtype: "journal_entry",
      title: "Daily note",
      bodyMarkdown: "Original source body.",
    });

    const response = await request(app)
      .patch(`/sources/${createResponse.body.rawSource.id}`)
      .send({
        sourceRole: "personal_note",
        sourceType: "manual",
        subtype: "book_note",
        title: "Updated note",
        bodyMarkdown: "Updated source body.",
      });

    expect(response.status).toBe(200);
    expect(response.body.rawSource).toMatchObject({
      id: createResponse.body.rawSource.id,
      subtype: "book_note",
      title: "Updated note",
    });
  });

  test("POST /sources rejects unsupported source roles", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
    });

    const response = await request(app).post("/sources").send({
      sourceRole: "review_task",
      title: "Nope",
      bodyMarkdown: "This role should not be accepted.",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(rawSourceRepository.sources).toHaveLength(0);
  });

  test("POST /sources/:id/compile queues source-first indexing without a raw note", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const agentRunRepository = new InMemoryAgentRunRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const app = createApp({
      rawSourceRepository,
      agentRunRepository,
      proposalRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      wikiIndexer: routeWikiIndexer,
    });
    const createResponse = await request(app).post("/sources").send({
      sourceRole: "personal_note",
      sourceType: "markdown",
      title: "Source-first note",
      bodyMarkdown: "# Source flow\n\nCompile this source through chunks.",
    });

    const response = await request(app)
      .post(`/sources/${createResponse.body.rawSource.id}/compile`)
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.agentRunId).toBeTruthy();
    expect(response.body.rawSource).toMatchObject({
      id: createResponse.body.rawSource.id,
      title: "Source-first note",
    });
    // Source-first: no compatibility raw note is created or returned.
    expect(response.body.rawNote).toBeUndefined();
    expect(agentRunRepository.agentRuns[0]).toMatchObject({
      runType: "compile_raw_note",
      input: {
        rawSourceId: createResponse.body.rawSource.id,
      },
    });
    expect(agentRunRepository.agentRuns[0].input).not.toHaveProperty("rawNoteId");

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].rawSourceId).toBe(createResponse.body.rawSource.id);
  });

  test("GET /sources/:id/indexing-trace returns a source-keyed trace", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const agentRunRepository = new InMemoryAgentRunRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const app = createApp({
      rawSourceRepository,
      agentRunRepository,
      proposalRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
    });
    const createResponse = await request(app).post("/sources").send({
      title: "Trace source",
      bodyMarkdown: "A note to trace.",
    });
    const sourceId = createResponse.body.rawSource.id;

    const traceResponse = await request(app).get(`/sources/${sourceId}/indexing-trace`);

    expect(traceResponse.status).toBe(200);
    expect(traceResponse.body.indexingTrace).toMatchObject({
      rawSource: { id: sourceId, title: "Trace source" },
      status: "Not compiled",
      agentRuns: [],
      proposals: [],
    });
  });
});
