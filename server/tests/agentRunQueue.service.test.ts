import { AgentRunQueueService } from "../src/services/agentRunQueue.service.js";
import { WikiIndexerService } from "../src/services/wikiIndexer.service.js";
import type { CodingExtraction } from "../src/domain/compiler.js";
import type { SearchResult } from "../src/domain/knowledge.js";
import type { RawNote } from "../src/domain/rawNote.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";

const llmWikiIndexer = {
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
        commonTraps: ["Forgetting bounded state in graph search"],
        patterns: [
          "Shortest Path With State",
          "Constrained Shortest Path",
          "K Stops / Edge Budget",
        ],
        algorithms: ["Dijkstra", "Priority Queue"],
        recognitionSignals: ["k stops", "edge budget", "dist[node][state]"],
        keyInsights: ["Track remaining stops as part of the distance state."],
        mistakes: ["Used plain Dijkstra without the stop dimension."],
        implementationDetails: ["Use dist[n][k+2] and heap tuples of cost, node, stops."],
        reviewActions: ["Practice constrained shortest path variants."],
        concepts: [
          {
            name: "Constrained Shortest Path",
            conceptType: "pattern",
            confidence: "high" as const,
          },
          {
            name: "Dijkstra With State",
            conceptType: "implementation_schema",
            confidence: "high" as const,
          },
        ],
        confidence: "high" as const,
      },
    };
  },
  draftProposal(
    rawNote: RawNote,
    extraction: CodingExtraction,
    relatedNotes: SearchResult[],
  ) {
    return {
      detectedDomain: extraction.domain,
      detectedKnowledgeType: extraction.knowledgeType,
      impactLevel: 3,
      confidence: extraction.confidence,
      rationale: `LLM indexed ${relatedNotes.length} related notes for ${rawNote.title ?? "raw note"}.`,
      items: [
        {
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: {
            domain: extraction.domain,
            knowledgeType: "algorithm",
            title: "Dijkstra With State",
            bodyMarkdown: extraction.keyInsights.join("\n"),
            structuredData: { concepts: extraction.concepts },
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
      domain: null,
      sourceType: "manual",
      sourceRole: "personal_note" as const,
      title: "Binary search note",
      bodyMarkdown: "This is about binary search on answer and monotonic feasibility.",
      extractedData: {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    const extraction: CodingExtraction = {
      domain: "coding",
      knowledgeType: "general_coding_note",
      problemNumber: null,
      problemTitle: null,
      reviewMapName: null,
      decisionRules: [],
      commonTraps: [],
      patterns: ["Binary Search on Answer"],
      algorithms: ["Binary Search"],
      recognitionSignals: ["monotonic feasibility"],
      keyInsights: ["Search the answer space when feasibility is monotonic."],
      mistakes: ["Do not label this as shortest path."],
      implementationDetails: ["Write a feasible(x) predicate."],
      reviewActions: ["Practice monotonic predicate problems."],
      concepts: [{ name: "Binary Search on Answer", conceptType: "pattern", confidence: "high" }],
      confidence: "high",
    };

    const draft = wikiIndexer.draftProposal(rawNote, extraction, [
      {
        id: "compiled-existing-1",
        targetType: "compiled_note",
        title: "Monotonic predicate",
        bodyMarkdown: "Feasibility predicates split the answer range.",
        domain: "coding",
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
      knowledgeType: "algorithm",
      title: "Binary Search",
    });
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
      domain: "coding",
      noteType: "algorithm",
      title: "BFS shortest path",
      bodyMarkdown: "Use BFS for unweighted shortest path and graph levels.",
      structuredData: {},
    });
    await knowledgeRepository.upsertCompiledNote({
      domain: "coding",
      noteType: "review_map",
      title: "Shortest path decision map",
      bodyMarkdown: "Choose BFS for unweighted shortest path and Dijkstra for positive weights.",
      structuredData: {},
    });
    await knowledgeRepository.upsertCompiledNote({
      domain: "coding",
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
    expect(agentRunRepository.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "queued",
        "run_started",
        "notes_loaded",
        "link_candidates_scored",
        "link_suggestion_created",
        "run_completed",
      ]),
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
      detectedKnowledgeType: "general_coding_note",
    });
    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].items.map((item) => item.actionType)).toEqual([
      "upsert_knowledge",
    ]);
    expect(rawNoteRepository.notes[0].extractedData).toMatchObject({
      patterns: expect.arrayContaining([
        "Shortest Path With State",
        "Constrained Shortest Path",
        "K Stops / Edge Budget",
      ]),
      algorithms: expect.arrayContaining(["Dijkstra", "Priority Queue"]),
    });
    expect(agentRunRepository.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "raw_note_loaded",
        "detection_completed",
        "wiki_index_drafted",
        "related_knowledge_found",
        "proposal_created",
        "run_completed",
      ]),
    );
  });

  test("fails compile_raw_note instead of falling back when LLM indexing is unavailable", async () => {
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
    expect(agentRunRepository.events.map((event) => event.eventType)).toContain("run_failed");
  });
});
