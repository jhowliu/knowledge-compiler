import { AgentRunQueueService } from "../src/services/agentRunQueue.service.js";
import { WikiIndexerService, type WikiIndexingSource } from "../src/services/wikiIndexer.service.js";
import type { GeneralKnowledgeExtraction } from "../src/domain/compiler.js";
import type { SearchResult } from "../src/domain/knowledge.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

const llmWikiIndexer = {
  async extract() {
    return {
      provider: "openai" as const,
      extraction: {
        knowledgeType: "knowledge_note",
        title: "Dijkstra With State",
        structuredData: {
          summary: "Track remaining stops as part of the distance state.",
          concepts: [
            {
              name: "Constrained Shortest Path",
              type: "method",
              specificity: "specific",
              confidence: "high" as const,
            },
            {
              name: "Dijkstra With State",
              type: "method",
              specificity: "specific",
              confidence: "high" as const,
            },
          ],
          claims: [
            {
              text: "Track remaining stops as part of the distance state.",
              confidence: "high" as const,
              evidenceChunkIds: [],
            },
          ],
          methods: [
            {
              name: "Dijkstra With State",
              purpose: "Handle shortest-path variants with a stop or edge budget.",
              steps: ["Use dist[n][k+2] and heap tuples of cost, node, stops."],
              conditions: ["k stops", "edge budget", "dist[node][state]"],
            },
          ],
          examples: [],
          constraints: [
            {
              text: "Forgetting bounded state in graph search is a common failure mode.",
              appliesTo: "constrained shortest path",
            },
          ],
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
      detectedDomain: null,
      detectedKnowledgeType: extraction.knowledgeType,
      impactLevel: 3,
      confidence: extraction.confidence,
      rationale: `LLM indexed ${relatedNotes.length} related notes for ${source.title ?? "source"}.`,
      items: [
        {
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: {
            knowledgeType: extraction.knowledgeType,
            title: extraction.title ?? "Dijkstra With State",
            bodyMarkdown: extraction.structuredData.summary,
            structuredData: extraction.structuredData,
          },
          rationale: "LLM proposed a compiled note.",
        },
      ],
    };
  },
};

describe("agent run queue service", () => {
  test("drafts generalized LLM wiki proposal items only", async () => {
    const wikiIndexer = new WikiIndexerService();
    const rawNote = {
      id: "raw-note-1",
      userId: null,
      rawSourceId: "raw-source-1",
      sourceType: "manual",
      sourceRole: "personal_note" as const,
      title: "Binary search note",
      bodyMarkdown: "This is about binary search on answer and monotonic feasibility.",
      rawNoteId: "raw-note-1",
      chunks: [],
    };
    const extraction: GeneralKnowledgeExtraction = {
      knowledgeType: "knowledge_note",
      title: "Binary Search on Answer",
      structuredData: {
        summary: "Search the answer space when feasibility is monotonic.",
        concepts: [
          {
            name: "Binary Search on Answer",
            type: "method",
            specificity: "specific",
            confidence: "high",
          },
        ],
        claims: [
          {
            text: "Search the answer space when feasibility is monotonic.",
            confidence: "high",
            evidenceChunkIds: [],
          },
        ],
        methods: [
          {
            name: "Binary Search on Answer",
            purpose: "Find an answer using monotonic feasibility.",
            steps: ["Write a feasible(x) predicate."],
            conditions: ["monotonic feasibility"],
          },
        ],
        examples: [],
        constraints: [],
        inferredSuggestions: [],
      },
      confidence: "high",
    };

    const draft = wikiIndexer.draftProposal(rawNote, extraction, [
      {
        id: "compiled-existing-1",
        targetType: "compiled_note",
        title: "Monotonic predicate",
        bodyMarkdown: "Feasibility predicates split the answer range.",
        noteType: "pattern",
        rank: 2,
        createdAt: new Date("2026-05-24T00:00:00.000Z"),
      },
    ]);

    expect(draft.items.map((item) => item.actionType)).toEqual([
      "upsert_knowledge",
      "create_link",
    ]);
    expect(draft.items.some((item) => item.actionType === "create_mistake")).toBe(false);
    expect(draft.items.some((item) => item.actionType === "create_review_task")).toBe(false);
    expect(draft.items.some((item) => item.actionType === "upsert_readiness")).toBe(false);
    expect(draft.items[0].payload).toMatchObject({
      knowledgeType: "knowledge_note",
      title: "Binary Search on Answer",
    });
    const knowledgePayload = draft.items[0].payload as { bodyMarkdown: string };
    expect(knowledgePayload.bodyMarkdown).toContain("## Claims");
    expect(knowledgePayload.bodyMarkdown).not.toContain("## Recognition signals");
  });

  test("runs deterministic reindex links and creates pending link suggestions", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
    );

    await knowledgeRepository.upsertCompiledNote({
      noteType: "algorithm",
      title: "BFS shortest path",
      bodyMarkdown: "Use BFS for unweighted shortest path and graph levels.",
      structuredData: {},
    });
    await knowledgeRepository.upsertCompiledNote({
      noteType: "knowledge_note",
      title: "Shortest path decision guide",
      bodyMarkdown: "Choose BFS for unweighted shortest path and Dijkstra for positive weights.",
      structuredData: {},
    });
    await knowledgeRepository.upsertCompiledNote({
      noteType: "algorithm",
      title: "Binary search",
      bodyMarkdown: "Use binary search for monotonic predicates.",
      structuredData: {},
    });

    const agentRun = await service.enqueue({ runType: "reindex_links" });
    await service.process(agentRun.id);

    const completedRun = await agentRunRepository.getById(agentRun.id);

    expect(completedRun).toMatchObject({
      runType: "reindex_links",
      status: "completed",
    });
    expect(completedRun?.output).toMatchObject({
      notesScanned: 3,
      suggestionsCreated: 1,
    });
    expect(noteLinkRepository.noteLinks).toHaveLength(1);
    expect(noteLinkRepository.noteLinks[0]).toMatchObject({
      status: "pending",
      relationType: "related_concept",
      createdByAgentRunId: agentRun.id,
    });
    expect(agentRunRepository.events.map((event) => `${event.category}.${event.name}`)).toEqual(
      expect.arrayContaining([
        "lifecycle.queued",
        "lifecycle.started",
        "source.notes_loaded",
        "linking.scored",
        "linking.suggestion_created",
        "lifecycle.completed",
      ]),
    );
    expect(agentRunRepository.events.map((event) => event.category)).toEqual(
      expect.arrayContaining(["lifecycle", "source", "linking"]),
    );
  });

  test("runs compile_raw_note with LLM wiki-style variant indexing", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      llmWikiIndexer,
    );
    const rawNote = await rawNoteRepository.create({
      title: "Review notes",
      bodyMarkdown:
        "忘記怎麼處理 k 次轉機，Dijkstra 可以處理但 k 次限制要額外紀錄 dist[n][k+2] => k+1 條邊可以走. heap = (cost, node, time)",
    });

    const agentRun = await service.enqueue({
      runType: "compile_raw_note",
      input: { rawNoteId: rawNote.id },
    });
    await service.process(agentRun.id);

    const completedRun = await agentRunRepository.getById(agentRun.id);

    expect(completedRun?.status).toBe("completed");
    expect(completedRun?.output).toMatchObject({
      rawNoteId: rawNote.id,
      provider: "openai",
      detectedKnowledgeType: "knowledge_note",
    });
    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].items.map((item) => item.actionType)).toEqual([
      "upsert_knowledge",
    ]);
    expect(rawNoteRepository.notes[0].extractedData).toMatchObject({
      structuredData: {
        concepts: expect.arrayContaining([
          expect.objectContaining({ name: "Constrained Shortest Path" }),
          expect.objectContaining({ name: "Dijkstra With State" }),
        ]),
        methods: expect.arrayContaining([
          expect.objectContaining({ name: "Dijkstra With State" }),
        ]),
      },
    });
    expect(agentRunRepository.events.map((event) => `${event.category}.${event.name}`)).toEqual(
      expect.arrayContaining([
        "source.raw_note_loaded",
        "indexing.detected",
        "indexing.drafted",
        "indexing.related_found",
        "proposal.created",
        "lifecycle.completed",
      ]),
    );
  });

  test("runs compile_raw_note from a raw source and indexes source chunks", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const seenSources: Array<{ rawSourceId: string | null; chunkCount: number; bodyMarkdown: string }> = [];
    const sourceAwareIndexer = {
      async extract(source: WikiIndexingSource) {
        seenSources.push({
          rawSourceId: source.rawSourceId,
          chunkCount: source.chunks.length,
          bodyMarkdown: source.bodyMarkdown,
        });
        return llmWikiIndexer.extract();
      },
      draftProposal: llmWikiIndexer.draftProposal,
    };
    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      sourceAwareIndexer,
      rawSourceRepository,
    );
    const rawSource = await rawSourceRepository.create(
      {
        title: "K stops source",
        sourceRole: "personal_note",
        sourceType: "markdown",
        bodyMarkdown: "# K stops\n\nDijkstra needs dist[node][stops].\n\n## Heap\n\nUse cost,node,time.",
      },
      [
        {
          chunkIndex: 0,
          heading: "K stops",
          bodyMarkdown: "Dijkstra needs dist[node][stops].",
          tokenEstimate: 8,
        },
        {
          chunkIndex: 1,
          heading: "Heap",
          bodyMarkdown: "Use cost,node,time.",
          tokenEstimate: 4,
        },
      ],
    );

    const agentRun = await service.enqueue({
      runType: "compile_raw_note",
      input: { rawSourceId: rawSource.id },
    });
    await service.process(agentRun.id);

    const completedRun = await agentRunRepository.getById(agentRun.id);

    expect(completedRun?.status).toBe("completed");
    expect(completedRun?.input).toMatchObject({ rawSourceId: rawSource.id });
    expect(completedRun?.output).toMatchObject({
      rawSourceId: rawSource.id,
      rawNoteId: "raw-note-1",
      chunkCount: 2,
    });
    expect(seenSources).toEqual([
      {
        rawSourceId: rawSource.id,
        chunkCount: 2,
        bodyMarkdown: rawSource.bodyMarkdown,
      },
    ]);
    expect(rawNoteRepository.notes[0]).toMatchObject({
      rawSourceId: rawSource.id,
      title: "K stops source",
    });
    expect(rawSourceRepository.sources[0].extractedData).toMatchObject({
      structuredData: {
        concepts: expect.arrayContaining([
          expect.objectContaining({ name: "Constrained Shortest Path" }),
        ]),
      },
    });
    expect(proposalRepository.proposals).toHaveLength(1);
    expect(agentRunRepository.events.map((event) => `${event.category}.${event.name}`)).toEqual(
      expect.arrayContaining(["source.raw_source_loaded", "proposal.created", "lifecycle.completed"]),
    );
  });

  test("fails compile_raw_note instead of falling back when LLM indexing is unavailable", async () => {
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const agentRunRepository = new InMemoryAgentRunRepository();
      const knowledgeRepository = new InMemoryKnowledgeRepository();
      const noteLinkRepository = new InMemoryNoteLinkRepository();
      const rawNoteRepository = new InMemoryRawNoteRepository();
      const proposalRepository = new InMemoryProposalRepository();
      const service = new AgentRunQueueService(
        agentRunRepository,
        knowledgeRepository,
        noteLinkRepository,
        rawNoteRepository,
        proposalRepository,
      );
      const rawNote = await rawNoteRepository.create({
        title: "Not shortest path",
        bodyMarkdown: "This is about binary search on answer and monotonic feasibility.",
      });

      const agentRun = await service.enqueue({
        runType: "compile_raw_note",
        input: { rawNoteId: rawNote.id },
      });

      await expect(service.process(agentRun.id)).rejects.toThrow("OPENAI_API_KEY is required");

      const failedRun = await agentRunRepository.getById(agentRun.id);
      expect(failedRun?.status).toBe("failed");
      expect(proposalRepository.proposals).toHaveLength(0);
      expect(rawNoteRepository.notes[0].extractedData).toEqual({});
      expect(agentRunRepository.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "lifecycle",
            name: "failed",
          }),
        ]),
      );
    } finally {
      if (originalOpenAIKey) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      }
    }
  });
});
