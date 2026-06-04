import {
  AgentRunQueueService,
  type CompileAgentRunnerFactory,
} from "../src/services/agentRunQueue.service.js";
import { WikiIndexerService, type WikiIndexingSource } from "../src/services/wikiIndexer.service.js";
import {
  createLlmCompileAgentRunner,
  type CompileModelClient,
} from "../src/services/compileAgentRunner.js";
import type { GeneralKnowledgeExtraction } from "../src/domain/compiler.js";
import type { SearchResult } from "../src/domain/knowledge.js";
import type { DraftProposalInput } from "@knowledge-compiler/agent-contracts";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";
import { InMemoryExtractionEvalRepository } from "./support/inMemoryExtractionEval.repository.js";
import type { AgentToolReadRepository } from "../src/repositories/agentTool.repository.js";

const llmWikiIndexer = {
  async extract() {
    return {
      provider: "openai" as const,
      extraction: {
        domain: "coding",
        knowledgeType: "knowledge_note",
        title: "Dijkstra With State",
        outcome: "create_knowledge" as const,
        outcomeReason: "This teaches a reusable shortest-path method.",
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
      detectedDomain: extraction.domain,
      detectedKnowledgeType: extraction.knowledgeType,
      impactLevel: 3,
      confidence: extraction.confidence,
      rationale: `LLM indexed ${relatedNotes.length} related notes for ${source.title ?? "source"}.`,
      items: [
        {
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: {
            domain: extraction.domain,
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
      domain: null,
      sourceType: "manual",
      sourceRole: "personal_note" as const,
      title: "Binary search note",
      bodyMarkdown: "This is about binary search on answer and monotonic feasibility.",
      rawNoteId: "raw-note-1",
      chunks: [],
    };
    const extraction: GeneralKnowledgeExtraction = {
      domain: "coding",
      knowledgeType: "knowledge_note",
      title: "Binary Search on Answer",
      outcome: "create_knowledge",
      outcomeReason: "This teaches a reusable search pattern.",
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
      knowledgeType: "knowledge_note",
      title: "Binary Search on Answer",
    });
    const knowledgePayload = draft.items[0].payload as { bodyMarkdown: string };
    expect(knowledgePayload.bodyMarkdown).toContain("## Claims");
    expect(knowledgePayload.bodyMarkdown).not.toContain("## Recognition signals");
  });

  test("drafts keep-searchable proposal for one-off interview answer sources", async () => {
    const wikiIndexer = new WikiIndexerService();
    const draft = wikiIndexer.draftProposal(
      {
        id: "source-interview-answer",
        rawNoteId: "raw-note-interview-answer",
        rawSourceId: "raw-source-interview-answer",
        userId: null,
        sourceRole: "personal_note",
        sourceType: "markdown",
        title: "Tell me about yourself",
        bodyMarkdown: "I grew up building small tools and I like product engineering.",
        chunks: [],
      },
      {
        domain: "general",
        knowledgeType: "knowledge_note",
        title: "Tell me about yourself",
        outcome: "keep_searchable",
        outcomeReason: "This looks like an interview answer draft, not reusable knowledge.",
        structuredData: {
          summary: "A personal interview answer draft.",
          concepts: [
            {
              name: "Self introduction",
              type: "topic",
              specificity: "specific",
              confidence: "medium",
            },
          ],
          claims: [],
          methods: [],
          examples: [],
          constraints: [],
          inferredSuggestions: [],
        },
        confidence: "high",
      },
      [],
    );

    expect(draft.rationale).toContain("Recommended: Keep searchable");
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      actionType: "keep_source_searchable",
      targetType: "raw_source",
      payload: {
        outcome: "keep_searchable",
        outcomeReason: "This looks like an interview answer draft, not reusable knowledge.",
        title: "Tell me about yourself",
      },
    });
    const sourceOnlyPayload = draft.items[0].payload as Record<string, unknown>;
    expect(sourceOnlyPayload.knowledgeProposal).toMatchObject({
      title: "Tell me about yourself",
      knowledgeType: "knowledge_note",
    });
  });

  test("respects the LLM keep_searchable decision for non-English sources", async () => {
    // No regex guard: a Chinese self-introduction draft is kept searchable purely
    // because the LLM extraction said so (#105).
    const wikiIndexer = new WikiIndexerService();
    const draft = wikiIndexer.draftProposal(
      {
        id: "source-zh-self-intro",
        rawNoteId: "raw-note-zh-self-intro",
        rawSourceId: "raw-source-zh-self-intro",
        userId: null,
        sourceRole: "personal_note",
        sourceType: "markdown",
        title: "自我介紹",
        bodyMarkdown: "我是一個產品導向的工程師,面試時想強調產品判斷力與圖形介面的專案。",
        chunks: [],
      },
      {
        domain: "general",
        knowledgeType: "knowledge_note",
        title: "自我介紹",
        outcome: "keep_searchable",
        outcomeReason: "這看起來是面試自我介紹草稿,不是可重用的知識。",
        structuredData: {
          summary: "一份個人面試自我介紹草稿。",
          concepts: [
            {
              name: "自我介紹",
              type: "topic",
              specificity: "specific",
              confidence: "medium",
            },
          ],
          claims: [],
          methods: [],
          examples: [],
          constraints: [],
          inferredSuggestions: [],
        },
        confidence: "high",
      },
      [],
    );

    expect(draft.rationale).toContain("Recommended: Keep searchable");
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      actionType: "keep_source_searchable",
      payload: {
        outcome: "keep_searchable",
      },
    });
  });

  test("drafts update-existing proposals with a target compiled note id", async () => {
    const wikiIndexer = new WikiIndexerService();
    const draft = wikiIndexer.draftProposal(
      {
        id: "source-rag-revision",
        rawNoteId: "raw-note-rag-revision",
        rawSourceId: "raw-source-rag-revision",
        userId: null,
        sourceRole: "reference",
        sourceType: "markdown",
        title: "RAG Evaluation Loop Revision",
        bodyMarkdown: "This is a revision of the original RAG evaluation loop.",
        chunks: [],
      },
      {
        domain: "general",
        knowledgeType: "knowledge_note",
        title: "RAG Evaluation Loop Revision",
        outcome: "update_existing_knowledge",
        outcomeReason: "This source revises an existing RAG evaluation loop.",
        structuredData: {
          summary: "A revision of a reusable RAG evaluation loop.",
          concepts: [
            {
              name: "RAG evaluation",
              type: "framework",
              specificity: "specific",
              confidence: "high",
            },
          ],
          claims: [],
          methods: [],
          examples: [],
          constraints: [],
          inferredSuggestions: [],
        },
        confidence: "high",
      },
      [
        {
          id: "compiled-rag-loop",
          targetType: "compiled_note",
          title: "Retrieval-Augmented Generation Evaluation Loop",
          bodyMarkdown: "Evaluate retrieval before answer generation.",
          domain: "general",
          noteType: "knowledge_note",
          rank: 3,
          createdAt: new Date("2026-05-24T00:00:00.000Z"),
        },
      ],
    );

    expect(draft.items[0]).toMatchObject({
      actionType: "upsert_knowledge",
      payload: {
        outcome: "update_existing_knowledge",
        targetCompiledNoteId: "compiled-rag-loop",
        targetTitle: "Retrieval-Augmented Generation Evaluation Loop",
      },
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
      noteType: "knowledge_note",
      title: "Shortest path decision guide",
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

  test("keeps a non-English interview draft searchable when the LLM decides keep_searchable", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const keepSearchableIndexer = {
      async extract() {
        return {
          provider: "openai" as const,
          extraction: {
            domain: "general",
            knowledgeType: "knowledge_note",
            title: "自我介紹",
            outcome: "keep_searchable" as const,
            outcomeReason: "這是面試自我介紹草稿,不是可重用的知識。",
            structuredData: {
              summary: "一份個人面試自我介紹草稿。",
              concepts: [
                {
                  name: "自我介紹",
                  type: "topic",
                  specificity: "specific",
                  confidence: "medium" as const,
                },
              ],
              claims: [],
              methods: [],
              examples: [],
              constraints: [],
              inferredSuggestions: [],
            },
            confidence: "high" as const,
          } satisfies GeneralKnowledgeExtraction,
        };
      },
      draftProposal: new WikiIndexerService().draftProposal,
    };
    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      keepSearchableIndexer,
    );
    const rawNote = await rawNoteRepository.create({
      title: "自我介紹",
      bodyMarkdown: "我是一個產品導向的工程師,這是我的面試自我介紹草稿。",
    });

    const agentRun = await service.enqueue({
      runType: "compile_raw_note",
      input: { rawNoteId: rawNote.id },
    });
    await service.process(agentRun.id);

    const completedRun = await agentRunRepository.getById(agentRun.id);

    expect(completedRun?.status).toBe("completed");
    expect(completedRun?.output).toMatchObject({
      indexingOutcome: "keep_searchable",
      detectedKnowledgeType: "knowledge_note",
    });
    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].items).toHaveLength(1);
    expect(proposalRepository.proposals[0].items[0]).toMatchObject({
      actionType: "keep_source_searchable",
      targetType: "raw_note",
    });
    expect(knowledgeRepository.compiledNotes).toHaveLength(0);
    expect(agentRunRepository.events.map((event) => `${event.category}.${event.name}`)).toEqual(
      expect.arrayContaining([
        "source.raw_note_loaded",
        "indexing.outcome_classified",
        "indexing.detected",
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

  test("accepts draft_proposal content supplied by the compile runner", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const extractionEvalRepository = new InMemoryExtractionEvalRepository();
    const sourceText = "Runner-authored proposal payload proves the model supplied the draft.";

    const runnerFactory: CompileAgentRunnerFactory = () => {
      let step = 0;
      return {
        async nextStep() {
          step += 1;
          if (step === 1) return { tool: "get_source", input: { source_id: "raw-source-1" } };
          if (step === 2) return { tool: "search_blocks", input: { query: "runner authored", limit: 8 } };
          const draftInput: DraftProposalInput = {
            indexing_outcome: "create_knowledge",
            outcome_reason: "The runner decided this should become reusable knowledge.",
            reasoning_summary: "The runner authored the proposal payload after observing the source and search.",
            incomplete_reasoning: false,
            items: [
              {
                action: "upsert_knowledge",
                target_block_id: null,
                title: "Runner Authored Knowledge",
                body_markdown: sourceText,
                structured_facets: {
                  summary: sourceText,
                  concepts: [],
                  claims: [{ text: sourceText, confidence: "high", evidenceChunkIds: ["raw-source-chunk-1"] }],
                  methods: [],
                  examples: [],
                  constraints: [],
                  inferredSuggestions: [],
                },
                source_concept_ids: [],
                source_spans: [{ chunk_index: 0, char_start: 0, char_end: sourceText.length, text: sourceText }],
                confidence: "high",
                conflict_detected: false,
                conflict_summary: null,
                conflict_resolution: null,
              },
            ],
            suggested_links: [
              {
                source_block_id: null,
                target_block_id: "knowledge-block-1",
                relation_type: "related_concept",
                confidence: "medium",
                rationale: "Runner judged this link from observations.",
              },
            ],
          };
          return { tool: "draft_proposal", input: draftInput };
        },
      };
    };

    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      llmWikiIndexer,
      rawSourceRepository,
      extractionEvalRepository,
      undefined,
      runnerFactory,
    );
    const rawSource = await rawSourceRepository.create(
      {
        title: "Runner source",
        sourceRole: "reference",
        sourceType: "markdown",
        bodyMarkdown: sourceText,
      },
      [{ chunkIndex: 0, heading: null, bodyMarkdown: sourceText, tokenEstimate: 12 }],
    );

    const agentRun = await service.enqueue({ runType: "compile_raw_note", input: { rawSourceId: rawSource.id } });
    await service.process(agentRun.id);

    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: "upsert_knowledge",
          payload: expect.objectContaining({ title: "Runner Authored Knowledge" }),
          rationale: "The runner authored the proposal payload after observing the source and search.",
        }),
        expect.objectContaining({
          actionType: "create_link",
          rationale: "Runner judged this link from observations.",
        }),
      ]),
    );
    const calledTools = agentRunRepository.events
      .filter((event) => event.category === "tool" && event.name === "called")
      .map((event) => (event.payload as { tool?: string }).tool);
    expect(calledTools).toEqual(["get_source", "search_blocks", "draft_proposal"]);
  });

  test("drives the loop with the LLM runner, authoring the draft in a model-chosen order", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const extractionEvalRepository = new InMemoryExtractionEvalRepository();
    const sourceText = "Track remaining stops as part of the distance state.";

    // The model picks search_blocks BEFORE lookup_concepts — the opposite of the
    // scripted runner's fixed order — proving tool order follows the runner.
    const modelClient: CompileModelClient = async (request) => {
      const available = new Set(request.tools.map((tool) => tool.name));
      if (available.has("get_source")) {
        return { toolName: "get_source", arguments: { source_id: "raw-source-1" } };
      }
      if (request.input.includes("search_blocks(") === false && available.has("search_blocks")) {
        return { toolName: "search_blocks", arguments: { query: "distance state", limit: 8 } };
      }
      if (request.input.includes("lookup_concepts(") === false && available.has("lookup_concepts")) {
        return { toolName: "lookup_concepts", arguments: { concepts: ["Bounded Graph State"], fuzzy: true } };
      }
      const draftInput: DraftProposalInput = {
        indexing_outcome: "create_knowledge",
        outcome_reason: "The model judged this reusable after searching the base.",
        reasoning_summary: "Model-authored proposal from observations.",
        incomplete_reasoning: false,
        items: [
          {
            action: "upsert_knowledge",
            target_block_id: null,
            title: "Bounded Graph State",
            body_markdown: sourceText,
            source_concept_ids: [],
            source_spans: [{ chunk_index: 0, char_start: 0, char_end: sourceText.length, text: sourceText }],
            confidence: "high",
            conflict_detected: false,
            conflict_summary: null,
            conflict_resolution: null,
          },
        ],
        suggested_links: [],
      };
      return { toolName: "draft_proposal", arguments: draftInput };
    };

    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      llmWikiIndexer,
      rawSourceRepository,
      extractionEvalRepository,
      undefined,
      (context) => createLlmCompileAgentRunner(context, { modelClient }),
    );
    const rawSource = await rawSourceRepository.create(
      {
        title: "Graph state",
        sourceRole: "reference",
        sourceType: "markdown",
        bodyMarkdown: sourceText,
      },
      [{ chunkIndex: 0, heading: null, bodyMarkdown: sourceText, tokenEstimate: 10 }],
    );

    const agentRun = await service.enqueue({ runType: "compile_raw_note", input: { rawSourceId: rawSource.id } });
    await service.process(agentRun.id);

    expect(proposalRepository.proposals).toHaveLength(1);
    expect(proposalRepository.proposals[0].items[0]).toMatchObject({
      actionType: "upsert_knowledge",
      payload: expect.objectContaining({ title: "Bounded Graph State" }),
      rationale: "Model-authored proposal from observations.",
    });
    const calledTools = agentRunRepository.events
      .filter((event) => event.category === "tool" && event.name === "called")
      .map((event) => (event.payload as { tool?: string }).tool);
    expect(calledTools).toEqual(["get_source", "search_blocks", "lookup_concepts", "draft_proposal"]);
  });

  test("creates an incomplete proposal when the compile runner exceeds loop guardrails", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const extractionEvalRepository = new InMemoryExtractionEvalRepository();

    const loopingRunnerFactory: CompileAgentRunnerFactory = () => {
      let first = true;
      return {
        async nextStep() {
          if (first) {
            first = false;
            return { tool: "get_source", input: { source_id: "raw-source-1" } };
          }
          return { tool: "search_blocks", input: { query: "repeat search", limit: 8 } };
        },
      };
    };
    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      llmWikiIndexer,
      rawSourceRepository,
      extractionEvalRepository,
      undefined,
      loopingRunnerFactory,
    );
    const rawSource = await rawSourceRepository.create(
      {
        title: "Looping source",
        sourceRole: "reference",
        sourceType: "markdown",
        bodyMarkdown: "Looping source still needs a safe incomplete proposal.",
      },
      [
        {
          chunkIndex: 0,
          heading: null,
          bodyMarkdown: "Looping source still needs a safe incomplete proposal.",
          tokenEstimate: 10,
        },
      ],
    );

    const agentRun = await service.enqueue({ runType: "compile_raw_note", input: { rawSourceId: rawSource.id } });
    await service.process(agentRun.id);

    const completedRun = await agentRunRepository.getById(agentRun.id);
    expect(completedRun?.status).toBe("completed");
    expect(completedRun?.output).toMatchObject({ indexingOutcome: "keep_searchable" });
    expect(proposalRepository.proposals[0].items[0]).toMatchObject({
      actionType: "keep_source_searchable",
      incompleteReasoning: true,
    });
    const searchCalls = agentRunRepository.events.filter(
      (event) =>
        event.category === "tool" &&
        event.name === "called" &&
        (event.payload as { tool?: string }).tool === "search_blocks",
    );
    expect(searchCalls).toHaveLength(3);
    expect(agentRunRepository.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "indexing",
          name: "loop_exited",
          payload: expect.objectContaining({ reason: "max_rounds" }),
        }),
      ]),
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

  test("classifies the indexing outcome after searching knowledge blocks and uses the chosen target", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const extractionEvalRepository = new InMemoryExtractionEvalRepository();

    let classifyCandidateCount: number | null = null;
    const reclassifyingIndexer = {
      extract: llmWikiIndexer.extract,
      draftProposal: llmWikiIndexer.draftProposal,
      async classifyOutcome(input: { candidateBlocks: unknown[] }) {
        classifyCandidateCount = input.candidateBlocks.length;
        return {
          outcome: "update_existing_knowledge" as const,
          outcomeReason: "This source revises an existing knowledge block.",
          targetBlockId: "block-existing-1",
          confidence: "high" as const,
          conflictDetected: true,
          conflictSummary: "The source revises the existing retrieval evaluation loop.",
          conflictResolution: "needs_user_decision" as const,
        };
      },
    };
    const readRepository: AgentToolReadRepository = {
      async getBlock(blockId: string) {
        return {
          block: {
            id: blockId,
            knowledge_source_id: "ks-1",
            knowledge_version_id: "kv-1",
            compiled_note_id: "cn-1",
            title: "Existing block",
            heading: null,
            body_markdown: "Existing body",
            status: "active",
          },
          evidence: [],
          links: [],
        };
      },
      async getBlockHistory() {
        return { versions: [] };
      },
      async lookupConcepts(concepts: string[]) {
        return {
          matches: concepts.map((concept) => ({
            input: concept,
            concept_id: null,
            canonical_label: null,
            match_type: "none" as const,
            linked_block_ids: [],
          })),
        };
      },
    };

    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      reclassifyingIndexer,
      rawSourceRepository,
      extractionEvalRepository,
      readRepository,
    );

    const rawSource = await rawSourceRepository.create(
      {
        title: "RAG eval revision",
        sourceRole: "reference",
        sourceType: "markdown",
        bodyMarkdown: "# RAG eval\n\nThis revises the retrieval evaluation loop.",
      },
      [
        {
          chunkIndex: 0,
          heading: "RAG eval",
          bodyMarkdown: "This revises the retrieval evaluation loop.",
          tokenEstimate: 8,
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
    // The provisional extraction outcome was create_knowledge; classification ran
    // after search and changed it to update_existing_knowledge.
    expect(completedRun?.output).toMatchObject({ indexingOutcome: "update_existing_knowledge" });
    expect(classifyCandidateCount).not.toBeNull();

    // The proposal carries the agent-chosen target block (bridge to #104).
    expect(proposalRepository.proposals).toHaveLength(1);
    const upsertItem = proposalRepository.proposals[0].items.find(
      (item) => item.actionType === "upsert_knowledge",
    );
    expect((upsertItem?.payload as Record<string, unknown>).targetBlockId).toBe("block-existing-1");

    // Conflict comes from the LLM classification, not a keyword scan (#105).
    expect(upsertItem).toMatchObject({
      conflictDetected: true,
      conflictSummary: "The source revises the existing retrieval evaluation loop.",
      conflictResolution: "needs_user_decision",
    });

    // The outcome decision is emitted only AFTER search_blocks has run (#103),
    // and a suspected conflict triggers a version-history read.
    const eventKeys = agentRunRepository.events.map((event) => {
      if (event.category === "tool" && event.name === "called") {
        return `tool.called:${(event.payload as { tool?: string }).tool}`;
      }
      return `${event.category}.${event.name}`;
    });
    const searchIndex = eventKeys.indexOf("tool.called:search_blocks");
    const outcomeIndex = eventKeys.indexOf("indexing.outcome_classified");
    expect(searchIndex).toBeGreaterThanOrEqual(0);
    expect(outcomeIndex).toBeGreaterThan(searchIndex);
    expect(eventKeys).toContain("tool.called:get_block_history");
  });

  test("updates a block surfaced via the concept index even when full-text search misses", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const extractionEvalRepository = new InMemoryExtractionEvalRepository();

    let classifyCandidateCount: number | null = null;
    const reclassifyingIndexer = {
      extract: llmWikiIndexer.extract,
      draftProposal: llmWikiIndexer.draftProposal,
      async classifyOutcome(input: { candidateBlocks: Array<{ block_id: string }> }) {
        classifyCandidateCount = input.candidateBlocks.length;
        return {
          outcome: "update_existing_knowledge" as const,
          outcomeReason: "Concept-index match covers this already.",
          // The concept-linked block, NOT a full-text search hit.
          targetBlockId: "block-concept-1",
          confidence: "high" as const,
          conflictDetected: false,
          conflictSummary: null,
          conflictResolution: null,
        };
      },
    };
    const readRepository: AgentToolReadRepository = {
      async getBlock(blockId: string) {
        return {
          block: {
            id: blockId,
            knowledge_source_id: "ks-concept-1",
            knowledge_version_id: "kv-concept-1",
            compiled_note_id: "cn-concept-1",
            title: "Concept-linked block",
            heading: null,
            body_markdown: "Existing concept body",
            status: "active",
          },
          evidence: [],
          links: [],
        };
      },
      async getBlockHistory() {
        return { versions: [] };
      },
      // Full-text search returns nothing, but the concept index links a block.
      async lookupConcepts(concepts: string[]) {
        return {
          matches: concepts.map((concept, index) => ({
            input: concept,
            concept_id: `concept-${index}`,
            canonical_label: concept,
            match_type: "exact" as const,
            linked_block_ids: index === 0 ? ["block-concept-1"] : [],
          })),
        };
      },
    };

    const service = new AgentRunQueueService(
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
      rawNoteRepository,
      proposalRepository,
      reclassifyingIndexer,
      rawSourceRepository,
      extractionEvalRepository,
      readRepository,
    );

    const rawSource = await rawSourceRepository.create(
      {
        title: "Constrained shortest path revisited",
        sourceRole: "reference",
        sourceType: "markdown",
        bodyMarkdown: "# Notes\n\nDifferent wording of an already-captured idea.",
      },
      [
        {
          chunkIndex: 0,
          heading: "Notes",
          bodyMarkdown: "Different wording of an already-captured idea.",
          tokenEstimate: 8,
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
    expect(completedRun?.output).toMatchObject({ indexingOutcome: "update_existing_knowledge" });

    // The concept-linked block became a candidate despite the full-text miss.
    expect(classifyCandidateCount).toBe(1);
    const upsertItem = proposalRepository.proposals[0].items.find(
      (item) => item.actionType === "upsert_knowledge",
    );
    expect((upsertItem?.payload as Record<string, unknown>).targetBlockId).toBe("block-concept-1");

    // The candidate was pulled in via get_block during concept-index recall.
    const calledTools = agentRunRepository.events
      .filter((event) => event.category === "tool" && event.name === "called")
      .map((event) => (event.payload as { tool?: string; input?: { block_id?: string } }));
    expect(
      calledTools.some((call) => call.tool === "get_block" && call.input?.block_id === "block-concept-1"),
    ).toBe(true);
  });
});
