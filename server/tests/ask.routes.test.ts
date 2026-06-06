import request from "supertest";
import { createApp } from "../src/app.js";
import { askSystemPrompt, type AskAnswerer } from "../src/services/ask.service.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

const topicA = "00000000-0000-4000-8000-000000000201";
const topicB = "00000000-0000-4000-8000-000000000202";

describe("ask system prompt", () => {
  test("scopes answers to the exact question instead of summarizing whole blocks", () => {
    const prompt = askSystemPrompt.toLowerCase();
    expect(prompt).toContain("exact question");
    expect(prompt).toContain("examples, return only the examples");
    expect(prompt).toContain("concise definition first");
    expect(prompt).toContain("do not include unrelated steps");
  });

  test("still requires grounding and citation markers", () => {
    const prompt = askSystemPrompt.toLowerCase();
    expect(prompt).toContain("only the retrieved knowledge blocks");
    expect(prompt).toContain("do not use outside knowledge");
    expect(prompt).toContain("not contain enough information");
    expect(prompt).toContain("[1], [2]");
  });
});

describe("ask routes", () => {
  test("POST /ask returns grounded answer with source citations", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Agent Memory",
      bodyMarkdown: "Agent memory should retrieve approved knowledge blocks.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Retrieval",
          bodyMarkdown: "RAG answers should cite approved knowledge blocks.",
          tokenEstimate: 8,
          metadata: {},
        },
      ],
    });
    await knowledgeRepository.createEvidenceLink({
      sourceType: "raw_source_chunk",
      sourceId: "raw-source-chunk-1",
      targetType: "knowledge_block",
      targetId: "knowledge-block-1",
      confidence: "high",
      impactLevel: 1,
      approvalStatus: "approved",
    });
    const askAnswerer: AskAnswerer = {
      async answer(input) {
        expect(input.blocks).toHaveLength(1);
        expect(input.blocks[0]).toMatchObject({
          blockId: "knowledge-block-1",
          citationIndex: 1,
        });
        return "Use approved knowledge blocks for RAG answers. [1]";
      },
    };
    const app = createApp({
      knowledgeRepository,
      noteLinkRepository,
      askAnswerer,
    });

    const response = await request(app).post("/ask").send({
      query: "How should RAG answers cite sources?",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      answer: "Use approved knowledge blocks for RAG answers. [1]",
      citations: [
        {
          block_id: "knowledge-block-1",
          title: "Agent Memory",
          chunk_text: "RAG answers should cite approved knowledge blocks.",
          source_note_title: "Agent Memory",
          source_note_id: "raw-source-chunk-1",
          tier: "knowledge",
        },
      ],
    });
  });

  test("POST /ask returns graceful not-enough-information response with no matches", async () => {
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
      askAnswerer: {
        async answer() {
          throw new Error("answerer should not be called without retrieved blocks");
        },
      },
    });

    const response = await request(app).post("/ask").send({
      query: "What does my knowledge base say about transformers?",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      answer: "I don't have enough information in the approved knowledge base to answer that.",
      citations: [],
    });
  });

  test("POST /ask falls back to raw sources when no knowledge matches (#143)", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    await rawSourceRepository.create(
      {
        bodyMarkdown: "Sync notes: we decided to ship the vector index next sprint.",
        title: "Sync notes",
        sourceRole: "personal_note",
      },
      [
        {
          chunkIndex: 0,
          heading: "Decisions",
          bodyMarkdown: "Sync notes: we decided to ship the vector index next sprint.",
          tokenEstimate: 11,
        },
      ],
    );

    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
      rawSourceRepository,
      askAnswerer: {
        async answer(input) {
          expect(input.blocks).toHaveLength(1);
          expect(input.blocks[0].tier).toBe("source");
          return "You decided to ship the vector index next sprint. [1]";
        },
      },
    });

    const response = await request(app).post("/ask").send({
      query: "vector index",
    });

    expect(response.status).toBe(200);
    expect(response.body.answer).toBe("You decided to ship the vector index next sprint. [1]");
    expect(response.body.citations).toEqual([
      {
        block_id: expect.any(String),
        title: "Sync notes",
        chunk_text: "Sync notes: we decided to ship the vector index next sprint.",
        source_note_title: "Sync notes",
        source_note_id: expect.any(String),
        tier: "source",
      },
    ]);
  });

  test("POST /ask topic_ids filter narrows the retrieval corpus", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Topic A Retrieval",
      bodyMarkdown: "Shared retrieval phrase belongs to topic A.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "A",
          bodyMarkdown: "shared retrieval phrase alpha",
          tokenEstimate: 4,
          metadata: { topicIds: [topicA] },
        },
      ],
    });
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Topic B Retrieval",
      bodyMarkdown: "Shared retrieval phrase belongs to topic B.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "B",
          bodyMarkdown: "shared retrieval phrase beta",
          tokenEstimate: 4,
          metadata: { topicIds: [topicB] },
        },
      ],
    });
    const app = createApp({
      knowledgeRepository,
      noteLinkRepository: new InMemoryNoteLinkRepository(),
      askAnswerer: {
        async answer(input) {
          return `Answered from ${input.blocks[0].title}. [1]`;
        },
      },
    });

    const response = await request(app).post("/ask").send({
      query: "shared retrieval phrase",
      topic_ids: [topicB],
    });

    expect(response.status).toBe(200);
    expect(response.body.answer).toBe("Answered from Topic B Retrieval. [1]");
    expect(response.body.citations).toEqual([
      expect.objectContaining({
        block_id: "knowledge-block-2",
        title: "Topic B Retrieval",
      }),
    ]);
  });

  test("POST /ask can retrieve through concept index matches", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const compiledNote = await knowledgeRepository.upsertCompiledNote({
      domain: "research",
      noteType: "paper_note",
      title: "Rank fusion",
      bodyMarkdown: "Combine independent retrievers by reciprocal rank.",
      structuredData: {},
    });
    const concept = await knowledgeRepository.upsertConcept({
      name: "RRF",
      conceptType: "retrieval_strategy",
    });
    await knowledgeRepository.indexConcept({
      conceptId: concept.id,
      targetType: "compiled_note",
      targetId: compiledNote.id,
      relationType: "canonicalizes",
      confidence: "high",
      source: "test",
    });
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Rank fusion",
      bodyMarkdown: "Combine independent retrievers by reciprocal rank.",
      structuredData: {},
      compiledNoteId: compiledNote.id,
      blocks: [
        {
          blockIndex: 0,
          heading: "Fusion",
          bodyMarkdown: "Combine independent retrievers by reciprocal rank.",
          tokenEstimate: 6,
          metadata: {},
        },
      ],
    });
    const app = createApp({
      knowledgeRepository,
      noteLinkRepository: new InMemoryNoteLinkRepository(),
      askAnswerer: {
        async answer(input) {
          return `Concept-index retrieval found ${input.blocks[0].title}. [1]`;
        },
      },
    });

    const response = await request(app).post("/ask").send({
      query: "RRF",
    });

    expect(response.status).toBe(200);
    expect(response.body.citations[0]).toMatchObject({
      block_id: "knowledge-block-1",
      title: "Rank fusion",
    });
  });

  test("POST /ask can retrieve context through embedding similarity", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const snapshot = await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Semantic Retrieval",
      bodyMarkdown: "Embeddings find related meaning even when words differ.",
      structuredData: {},
      blocks: [
        {
          blockIndex: 0,
          heading: "Embeddings",
          bodyMarkdown: "Embeddings find related meaning even when words differ.",
          tokenEstimate: 9,
          metadata: {},
        },
      ],
    });
    await knowledgeRepository.updateKnowledgeBlockEmbedding(snapshot.blocks[0].id, [0, 1, 0]);
    const app = createApp({
      knowledgeRepository,
      noteLinkRepository: new InMemoryNoteLinkRepository(),
      embeddingService: {
        async embedText() {
          return [0, 1, 0];
        },
      },
      askAnswerer: {
        async answer(input) {
          expect(input.blocks[0].title).toBe("Semantic Retrieval");
          return "Embedding retrieval found the semantic note. [1]";
        },
      },
    });

    const response = await request(app).post("/ask").send({
      query: "meaning based lookup",
    });

    expect(response.status).toBe(200);
    expect(response.body.citations[0]).toMatchObject({
      block_id: snapshot.blocks[0].id,
      title: "Semantic Retrieval",
    });
  });

  test("POST /ask pulls one-hop approved linked knowledge into answer context", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const firstNote = await knowledgeRepository.upsertCompiledNote({
      domain: "research",
      noteType: "paper_note",
      title: "Vector retrieval",
      bodyMarkdown: "RRF combines retrieval ranks.",
      structuredData: {},
    });
    const secondNote = await knowledgeRepository.upsertCompiledNote({
      domain: "research",
      noteType: "paper_note",
      title: "Citation policy",
      bodyMarkdown: "Answers cite blocks.",
      structuredData: {},
    });
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Vector retrieval",
      bodyMarkdown: "RRF combines retrieval ranks.",
      structuredData: {},
      compiledNoteId: firstNote.id,
      blocks: [
        {
          blockIndex: 0,
          heading: "Ranking",
          bodyMarkdown: "RRF combines retrieval ranks.",
          tokenEstimate: 5,
          metadata: {},
        },
      ],
    });
    await knowledgeRepository.upsertKnowledgeSourceVersion({
      domain: "research",
      knowledgeType: "paper_note",
      title: "Citation policy",
      bodyMarkdown: "Answers cite blocks.",
      structuredData: {},
      compiledNoteId: secondNote.id,
      blocks: [
        {
          blockIndex: 0,
          heading: "Citations",
          bodyMarkdown: "Every answer should cite its supporting block.",
          tokenEstimate: 7,
          metadata: {},
        },
      ],
    });
    await noteLinkRepository.createManual({
      sourceNoteType: "compiled_note",
      sourceNoteId: firstNote.id,
      targetNoteType: "compiled_note",
      targetNoteId: secondNote.id,
      relationType: "related_concept",
      confidence: "high",
    });
    const app = createApp({
      knowledgeRepository,
      noteLinkRepository,
      askAnswerer: {
        async answer(input) {
          expect(input.blocks.map((block) => block.title)).toEqual([
            "Vector retrieval",
            "Citation policy",
          ]);
          return "RRF ranks retrieval results, and linked citation policy says answers cite supporting blocks. [1] [2]";
        },
      },
    });

    const response = await request(app).post("/ask").send({
      query: "How does RRF retrieval work?",
    });

    expect(response.status).toBe(200);
    expect(response.body.citations.map((citation: { title: string }) => citation.title)).toEqual([
      "Vector retrieval",
      "Citation policy",
    ]);
  });
});
