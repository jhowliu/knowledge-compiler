import request from "supertest";
import { createApp } from "../src/app.js";
import type { CodingExtraction } from "../src/domain/compiler.js";
import type { SearchResult } from "../src/domain/knowledge.js";
import type { WikiIndexingSource } from "../src/services/wikiIndexer.service.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

const routeWikiIndexer = {
  async extract() {
    return {
      provider: "openai" as const,
      extraction: {
        domain: "coding" as const,
        knowledgeType: "general_coding_note" as const,
        problemNumber: null,
        problemTitle: null,
        reviewMapName: null,
        decisionRules: [],
        commonTraps: [],
        patterns: ["Source-first Indexing"],
        algorithms: [],
        recognitionSignals: ["source chunks"],
        keyInsights: ["Index source chunks before drafting approved knowledge."],
        mistakes: [],
        implementationDetails: ["Compile from /sources/:id/compile."],
        reviewActions: [],
        concepts: [
          {
            name: "Source-first Indexing",
            conceptType: "workflow",
            confidence: "high" as const,
          },
        ],
        confidence: "high" as const,
      },
    };
  },
  draftProposal(
    source: WikiIndexingSource,
    extraction: CodingExtraction,
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
            bodyMarkdown: extraction.keyInsights.join("\n"),
            structuredData: { rawSourceId: source.rawSourceId },
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
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app).post("/sources").send({
      sourceRole: "reference",
      sourceType: "paper",
      title: "Attention Is All You Need",
      bodyMarkdown: "# Transformer\n\nSelf-attention replaces recurrence.",
    });

    expect(response.status).toBe(201);
    expect(response.body.rawSource).toMatchObject({
      sourceRole: "reference",
      sourceType: "paper",
      title: "Attention Is All You Need",
    });
    expect(response.body.rawSource.chunks).toHaveLength(1);
    expect(response.body.rawSource.chunks[0]).toMatchObject({
      chunkIndex: 0,
      heading: "Transformer",
    });
  });

  test("POST /sources rejects unsupported source roles", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
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

  test("POST /sources/:id/compile queues source-first indexing and creates compatibility raw note", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const agentRunRepository = new InMemoryAgentRunRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const app = createApp({
      rawSourceRepository,
      rawNoteRepository,
      agentRunRepository,
      proposalRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
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
    expect(response.body.rawNote).toMatchObject({
      rawSourceId: createResponse.body.rawSource.id,
      title: "Source-first note",
    });
    expect(agentRunRepository.agentRuns[0]).toMatchObject({
      runType: "compile_raw_note",
      input: {
        rawSourceId: createResponse.body.rawSource.id,
        rawNoteId: response.body.rawNote.id,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].rawNoteId).toBe(response.body.rawNote.id);
  });
});
