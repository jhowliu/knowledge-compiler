import { ProposalService } from "../src/services/proposal.service.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";

describe("ProposalService", () => {
  test("approves keep-searchable proposals without creating knowledge artifacts", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);
    const proposal = await proposals.create({
      rawSourceId: "raw-source-interview-answer",
      draft: {
        detectedDomain: "general",
        detectedKnowledgeType: "source_only",
        impactLevel: 1,
        confidence: "high",
        rationale: "Recommended: Keep searchable. This is an interview answer draft.",
        items: [
          {
            actionType: "keep_source_searchable",
            targetType: "raw_source",
            payload: {
              outcome: "keep_searchable",
              outcomeReason: "This looks like an interview answer draft, not reusable knowledge.",
              title: "Tell me about yourself",
              concepts: [{ name: "self introduction", type: "topic", confidence: "medium" }],
              knowledgeProposal: {
                domain: "general",
                knowledgeType: "knowledge_note",
                title: "Tell me about yourself",
                bodyMarkdown: "A personal answer draft.",
                structuredData: { concepts: [] },
              },
            },
            rationale: "This source should remain searchable without becoming graph knowledge.",
          },
        ],
      },
    });

    const approved = await service.approveProposal(proposal.id);

    expect(approved.status).toBe("approved");
    expect(approved.rawSourceId).toBe("raw-source-interview-answer");
    expect(approved.items[0].payload).toMatchObject({
      rawSourceId: "raw-source-interview-answer",
    });
    expect(knowledge.compiledNotes).toHaveLength(0);
    expect(knowledge.knowledgeSources).toHaveLength(0);
    expect(knowledge.knowledgeVersions).toHaveLength(0);
    expect(knowledge.knowledgeBlocks).toHaveLength(0);
    expect(noteLinks.noteLinks).toHaveLength(0);
  });

  test("can override a keep-searchable recommendation into a knowledge note", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);
    const proposal = await proposals.create({
      rawSourceId: "raw-source-framework",
      draft: {
        detectedDomain: "general",
        detectedKnowledgeType: "source_only",
        impactLevel: 1,
        confidence: "medium",
        rationale: "Recommended: Keep searchable.",
        items: [
          {
            actionType: "keep_source_searchable",
            targetType: "raw_source",
            payload: {
              outcome: "keep_searchable",
              outcomeReason: "The agent was unsure whether this is reusable.",
              knowledgeProposal: {
                domain: "interviewing",
                knowledgeType: "knowledge_note",
                title: "Project story framework",
                bodyMarkdown: "Use context, decision, tradeoff, and outcome.",
                structuredData: { concepts: [] },
              },
            },
            rationale: "Keep source only by default.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id, { indexingOutcomeOverride: "create_knowledge" });

    expect(knowledge.compiledNotes).toHaveLength(1);
    expect(knowledge.knowledgeSources).toHaveLength(1);
    expect(knowledge.evidenceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "raw_source",
          sourceId: "raw-source-framework",
        }),
      ]),
    );
    expect(knowledge.compiledNotes[0]).toMatchObject({
      domain: "interviewing",
      noteType: "knowledge_note",
      title: "Project story framework",
    });
  });

  test("approves proposal items into compiled and canonical knowledge", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);
    knowledge.rawSourceChunkIdsByRawSourceId.set("raw-source-1", ["raw-source-chunk-1", "raw-source-chunk-2"]);
    const proposal = await proposals.create({
      rawSourceId: "raw-source-1",
      draft: {
        detectedDomain: "coding",
        detectedKnowledgeType: "problem_reflection",
        impactLevel: 3,
        confidence: "high",
        rationale: "Detected coding note.",
        items: [
          {
            actionType: "upsert_compiled_note",
            targetType: "compiled_note",
            payload: {
              domain: "coding",
              noteType: "problem_note",
              title: "1334. Find the City",
              bodyMarkdown: "Problem: Find the City",
              structuredData: { concepts: [] },
            },
            rationale: "Create problem note.",
          },
        ],
      },
    });

    const approved = await service.approveProposal(proposal.id);

    expect(approved.status).toBe("approved");
    expect(knowledge.compiledNotes).toHaveLength(1);
    expect(knowledge.knowledgeSources).toHaveLength(1);
    expect(knowledge.knowledgeVersions).toHaveLength(1);
    expect(knowledge.knowledgeBlocks).toHaveLength(1);
    expect(knowledge.knowledgeSources[0]).toMatchObject({
      domain: "coding",
      knowledgeType: "problem_note",
      title: "1334. Find the City",
      currentVersionId: "knowledge-version-1",
    });
    expect(knowledge.knowledgeVersions[0]).toMatchObject({
      compiledNoteId: "compiled-1",
      proposalId: proposal.id,
      versionNumber: 1,
    });
    expect(
      knowledge.evidenceLinks.filter(
        (link) =>
          link.sourceType === "raw_source_chunk" &&
          link.targetType === "knowledge_version" &&
          link.targetId === "knowledge-version-1",
      ),
    ).toHaveLength(2);
  });

  test("does not create blind related-note links on upsert approval (#98)", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);
    knowledge.relatedResults = [
      {
        id: "compiled-existing-1",
        targetType: "compiled_note",
        title: "BFS for unweighted shortest path",
        bodyMarkdown: "Use BFS when all edges have weight 1.",
        domain: "coding",
        noteType: "algorithm",
        rank: 2,
        createdAt: new Date("2026-05-24T00:00:00.000Z"),
      },
    ];
    const proposal = await proposals.create({
      draft: {
        detectedDomain: "coding",
        detectedKnowledgeType: "knowledge_note",
        impactLevel: 4,
        confidence: "high",
        rationale: "Detected decision guide.",
        items: [
          {
            actionType: "upsert_compiled_note",
            targetType: "compiled_note",
            payload: {
              domain: "coding",
              noteType: "knowledge_note",
              title: "Shortest Path Decision Guide",
              bodyMarkdown: "Weight = 1 -> BFS",
              structuredData: {
                concepts: [{ name: "BFS", conceptType: "algorithm" }],
              },
            },
            rationale: "Create knowledge note.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    // Even with related candidates present, approving an upsert no longer creates
    // links server-side — only explicit agent-judged create_link items do (#98).
    expect(noteLinks.noteLinks).toHaveLength(0);
  });

  test("creates a new knowledge version and archives old blocks on repeated approval", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);

    const firstProposal = await proposals.create({
      draft: {
        detectedDomain: "coding",
        detectedKnowledgeType: "general_coding_note",
        impactLevel: 2,
        confidence: "medium",
        rationale: "Initial note.",
        items: [
          {
            actionType: "upsert_compiled_note",
            targetType: "compiled_note",
            payload: {
              domain: "coding",
              noteType: "algorithm",
              title: "Dijkstra",
              bodyMarkdown: "Use a priority queue for positive weighted shortest paths.",
              structuredData: { concepts: [] },
            },
            rationale: "Create algorithm note.",
          },
        ],
      },
    });
    await service.approveProposal(firstProposal.id);

    const secondProposal = await proposals.create({
      draft: {
        detectedDomain: "coding",
        detectedKnowledgeType: "general_coding_note",
        impactLevel: 2,
        confidence: "medium",
        rationale: "Update note.",
        items: [
          {
            actionType: "upsert_compiled_note",
            targetType: "compiled_note",
            payload: {
              domain: "coding",
              noteType: "algorithm",
              title: "Dijkstra",
              bodyMarkdown: "Track extra state when constraints limit stops or edges.",
              structuredData: { concepts: [] },
            },
            rationale: "Update algorithm note.",
          },
        ],
      },
    });
    await service.approveProposal(secondProposal.id);

    expect(knowledge.knowledgeSources).toHaveLength(1);
    expect(knowledge.knowledgeVersions.map((version) => version.versionNumber)).toEqual([1, 2]);
    expect(knowledge.knowledgeSources[0].currentVersionId).toBe("knowledge-version-2");
    expect(knowledge.knowledgeBlocks.map((block) => block.status)).toEqual(["archived", "active"]);
  });

  test("stores embeddings for approved knowledge blocks when embedding service is available", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks, {
      async embedText(text) {
        expect(text).toContain("Vector search");
        return [1, 0, 0];
      },
    });

    const proposal = await proposals.create({
      draft: {
        detectedDomain: "research",
        detectedKnowledgeType: "paper_note",
        impactLevel: 2,
        confidence: "high",
        rationale: "Embedding smoke proposal.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "research",
              knowledgeType: "paper_note",
              title: "Vector search",
              bodyMarkdown: "Vector search helps semantic retrieval.",
              structuredData: { concepts: [] },
            },
            rationale: "Create approved knowledge.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    expect(knowledge.embeddings.get("knowledge-block-1")).toEqual([1, 0, 0]);
  });

  test("embedding failure does not break approve or leave knowledge unapplied", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks, {
      async embedText() {
        throw new Error("embedding API down");
      },
    });
    const originalWarn = console.warn;
    console.warn = () => {};

    const proposal = await proposals.create({
      draft: {
        detectedDomain: "research",
        detectedKnowledgeType: "paper_note",
        impactLevel: 2,
        confidence: "high",
        rationale: "Embedding failure proposal.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "research",
              knowledgeType: "paper_note",
              title: "Resilient embedding",
              bodyMarkdown: "Embedding runs after the approve transaction commits.",
              structuredData: { concepts: [] },
            },
            rationale: "Create approved knowledge.",
          },
        ],
      },
    });

    const approved = await service.approveProposal(proposal.id);

    // Embedding runs after commit, so its failure must not roll back or orphan
    // the applied knowledge — the block is simply left unembedded (backfillable).
    expect(approved.status).toBe("approved");
    expect(knowledge.compiledNotes).toHaveLength(1);
    expect(knowledge.knowledgeVersions).toHaveLength(1);
    expect(knowledge.knowledgeBlocks).toHaveLength(1);
    expect(knowledge.embeddings.size).toBe(0);

    console.warn = originalWarn;
  });

  test("stores generated contextual retrieval context and prepends it before embedding", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const embeddedTexts: string[] = [];
    const service = new ProposalService(
      proposals,
      knowledge,
      noteLinks,
      {
        async embedText(text) {
          embeddedTexts.push(text);
          return [1, 0, 0];
        },
      },
      {
        async contextualize({ note, chunk }) {
          expect(note).toContain("Vector search helps semantic retrieval.");
          expect(chunk).toContain("Vector search");
          return "Context: this note explains vector search for retrieval.";
        },
      },
    );

    const proposal = await proposals.create({
      draft: {
        detectedDomain: "research",
        detectedKnowledgeType: "paper_note",
        impactLevel: 2,
        confidence: "high",
        rationale: "Contextual retrieval proposal.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "research",
              knowledgeType: "paper_note",
              title: "Vector search",
              bodyMarkdown: "Vector search helps semantic retrieval.",
              structuredData: { concepts: [] },
            },
            rationale: "Create approved knowledge.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    const block = knowledge.knowledgeBlocks.find((candidate) => candidate.status === "active");
    expect(block?.metadata).toMatchObject({
      context: "Context: this note explains vector search for retrieval.",
    });
    expect(embeddedTexts[0]).toBe(
      "Context: this note explains vector search for retrieval.\n\nVector search helps semantic retrieval.",
    );
  });

  test("stores the model-authored readable note as the body, keeping facets as metadata (#119)", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);

    const proposal = await proposals.create({
      draft: {
        detectedDomain: "learning",
        detectedKnowledgeType: "knowledge_note",
        impactLevel: 2,
        confidence: "high",
        rationale: "General facets proposal.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "learning",
              knowledgeType: "knowledge_note",
              title: "Grounded note format",
              bodyMarkdown:
                "Ground approved knowledge in the source so the note stays trustworthy and easy to read.",
              structuredData: {
                summary: "Facets should drive approved markdown.",
                concepts: [
                  {
                    name: "Facet rendering",
                    type: "method",
                    specificity: "specific",
                    confidence: "high",
                  },
                ],
                claims: [
                  {
                    text: "Approved markdown is rendered from facets.",
                    confidence: "high",
                    evidenceChunkIds: ["chunk-1"],
                  },
                ],
                methods: [
                  {
                    name: "Facet-first approval",
                    purpose: "Keep structured data and markdown aligned.",
                    steps: ["Normalize facets", "Render markdown", "Store approved knowledge"],
                    conditions: ["Structured facets are present"],
                  },
                ],
                examples: [],
                constraints: [
                  {
                    text: "Do not store a separate LLM markdown narrative when facets exist.",
                    appliesTo: "proposal approval",
                  },
                ],
                inferredSuggestions: [
                  {
                    text: "Maybe add authoring guidelines later.",
                    reason: "Useful but not part of approved source-backed content.",
                    confidence: "low",
                  },
                ],
              },
            },
            rationale: "Create approved knowledge from facets.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    // Body is the readable model-authored note, not a facet dump (#119).
    expect(knowledge.compiledNotes[0].bodyMarkdown).toBe(
      "Ground approved knowledge in the source so the note stays trustworthy and easy to read.",
    );
    expect(knowledge.compiledNotes[0].bodyMarkdown).not.toContain("## Summary");
    expect(knowledge.compiledNotes[0].bodyMarkdown).not.toContain("## Claims");
    expect(knowledge.compiledNotes[0].bodyMarkdown).not.toContain("## Concepts");
    // Facets are still preserved as metadata.
    expect(knowledge.compiledNotes[0].structuredData).toMatchObject({
      concepts: [expect.objectContaining({ name: "Facet rendering", type: "method" })],
      claims: [expect.objectContaining({ text: "Approved markdown is rendered from facets." })],
    });
  });

  test("approves generalized knowledge updates and creates pending link suggestions", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);

    const existing = await knowledge.upsertCompiledNote({
      domain: "coding",
      noteType: "algorithm",
      title: "BFS",
      bodyMarkdown: "Use BFS for unweighted shortest paths.",
      structuredData: {},
    });
    const proposal = await proposals.create({
      draft: {
        detectedDomain: "coding",
        detectedKnowledgeType: "algorithm",
        impactLevel: 3,
        confidence: "high",
        rationale: "Generalized LLM wiki proposal.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "coding",
              knowledgeType: "algorithm",
              title: "Dijkstra",
              bodyMarkdown: "Use Dijkstra for positive weighted shortest paths.",
              structuredData: {
                concepts: [{ name: "Shortest Path", conceptType: "pattern" }],
              },
            },
            rationale: "Create approved knowledge.",
          },
          {
            actionType: "create_link",
            targetType: "note_link",
            payload: {
              sourceTitle: "Dijkstra",
              targetNoteType: "compiled_note",
              targetNoteId: existing.id,
              relationType: "related_concept",
              confidence: "high",
            },
            rationale: "Connect related shortest-path knowledge.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    expect(knowledge.compiledNotes).toHaveLength(2);
    expect(knowledge.knowledgeSources).toHaveLength(1);
    expect(knowledge.knowledgeSources[0]).toMatchObject({
      knowledgeType: "algorithm",
      title: "Dijkstra",
    });
    expect(noteLinks.noteLinks).toHaveLength(1);
    expect(noteLinks.noteLinks[0]).toMatchObject({
      sourceNoteId: "compiled-2",
      targetNoteId: existing.id,
      relationType: "related_concept",
      status: "pending",
    });
  });

  test("lands an agent-suggested link (by block id) as a note_link on approve", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);

    // An existing note the agent will link to. The agent references the block id
    // (target_block_id), not the compiled-note id.
    const existing = await knowledge.upsertCompiledNote({
      domain: "coding",
      noteType: "algorithm",
      title: "BFS",
      bodyMarkdown: "Use BFS for unweighted shortest paths.",
      structuredData: {},
    });
    const existingSnapshot = await knowledge.upsertKnowledgeSourceVersion({
      domain: existing.domain,
      knowledgeType: existing.noteType,
      title: existing.title,
      bodyMarkdown: existing.bodyMarkdown,
      structuredData: existing.structuredData,
      compiledNoteId: existing.id,
      proposalId: "proposal-existing",
      changeSummary: "Initial version.",
      blocks: [{ blockIndex: 0, heading: null, bodyMarkdown: existing.bodyMarkdown, tokenEstimate: 8 }],
    });
    const targetBlockId = existingSnapshot.blocks[0].id;

    const proposal = await proposals.create({
      draft: {
        detectedDomain: "coding",
        detectedKnowledgeType: "algorithm",
        impactLevel: 3,
        confidence: "high",
        rationale: "Agent-judged link.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "coding",
              knowledgeType: "algorithm",
              title: "Dijkstra",
              bodyMarkdown: "Use Dijkstra for positive weighted shortest paths.",
              structuredData: { concepts: [] },
            },
            rationale: "Create approved knowledge.",
          },
          {
            // Pure agent shape: only a block id, no targetNoteId / sourceTitle.
            actionType: "create_link",
            targetType: "note_link",
            payload: {
              targetBlockId,
              relationType: "related_concept",
              confidence: "high",
            },
            rationale: "Connect related shortest-path knowledge.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    // The block-id link now resolves to a compiled-note note_link (was silently
    // dropped before, because the consumer only read targetNoteId).
    expect(noteLinks.noteLinks).toHaveLength(1);
    expect(noteLinks.noteLinks[0]).toMatchObject({
      sourceNoteId: "compiled-2", // the Dijkstra note created by this proposal
      targetNoteId: existing.id,
      relationType: "related_concept",
      status: "pending",
    });
  });

  test("updates targeted existing knowledge instead of creating a duplicate for revisions", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);

    const existing = await knowledge.upsertCompiledNote({
      domain: "general",
      noteType: "knowledge_note",
      title: "Retrieval-Augmented Generation Evaluation Loop",
      bodyMarkdown: "Evaluate retrieval before answer generation.",
      structuredData: { concepts: [{ name: "RAG evaluation", type: "topic" }] },
    });
    const existingSnapshot = await knowledge.upsertKnowledgeSourceVersion({
      domain: existing.domain,
      knowledgeType: existing.noteType,
      title: existing.title,
      bodyMarkdown: existing.bodyMarkdown,
      structuredData: existing.structuredData,
      compiledNoteId: existing.id,
      proposalId: "proposal-original",
      changeSummary: "Initial version.",
      blocks: [{ blockIndex: 0, heading: null, bodyMarkdown: existing.bodyMarkdown, tokenEstimate: 8 }],
    });
    const proposal = await proposals.create({
      draft: {
        detectedDomain: "general",
        detectedKnowledgeType: "knowledge_note",
        impactLevel: 3,
        confidence: "high",
        rationale: "Recommended: Update existing knowledge.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "general",
              knowledgeType: "knowledge_note",
              title: "RAG Evaluation Loop Revision",
              bodyMarkdown: "Evaluate coverage, claim support, citation precision, and conflicts.",
              targetCompiledNoteId: existing.id,
              targetKnowledgeSourceId: existingSnapshot.source.id,
              structuredData: {
                concepts: [{ name: "RAG evaluation", type: "topic" }],
              },
            },
            rationale: "Revise the existing RAG evaluation knowledge.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    expect(knowledge.compiledNotes).toHaveLength(1);
    expect(knowledge.compiledNotes[0]).toMatchObject({
      id: existing.id,
      title: "RAG Evaluation Loop Revision",
    });
    // Body is the readable revision prose; the concept name is metadata, not body (#119).
    expect(knowledge.compiledNotes[0].bodyMarkdown).toBe(
      "Evaluate coverage, claim support, citation precision, and conflicts.",
    );
    expect(knowledge.compiledNotes[0].bodyMarkdown).not.toContain("## Concepts");
    expect(knowledge.knowledgeSources).toHaveLength(1);
    expect(knowledge.knowledgeSources[0]).toMatchObject({
      id: existingSnapshot.source.id,
      title: "RAG Evaluation Loop Revision",
      currentVersionId: "knowledge-version-2",
    });
    expect(knowledge.knowledgeVersions).toHaveLength(2);
    expect(knowledge.knowledgeVersions[1]).toMatchObject({
      knowledgeSourceId: existingSnapshot.source.id,
      compiledNoteId: existing.id,
      versionNumber: 2,
    });
  });

  test("stores the agent-authored merged body for targeted existing knowledge", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);
    const existingBody =
      "People are less likely to help someone in trouble when other people are around. The bystander effect is driven by diffusion of responsibility and pluralistic ignorance.";
    const exampleBody =
      "Example: At a train station, a passenger suddenly looks pale while nearby people wait for someone else to help. This illustrates the bystander effect.";
    const mergedBody = `${existingBody}\n\n## Examples\n${exampleBody}`;

    const existing = await knowledge.upsertCompiledNote({
      domain: "general",
      noteType: "knowledge_note",
      title: "Bystander Effect",
      bodyMarkdown: existingBody,
      structuredData: {
        summary: "The bystander effect reduces helping when others are present.",
        concepts: [
          { name: "bystander effect", type: "topic", specificity: "specific", confidence: "high" },
          { name: "diffusion of responsibility", type: "term", specificity: "specific", confidence: "high" },
        ],
        claims: [
          {
            text: "The bystander effect is driven by diffusion of responsibility and pluralistic ignorance.",
            confidence: "high",
            evidenceChunkIds: ["block-bystander"],
          },
        ],
        methods: [],
        examples: [],
        constraints: [],
        inferredSuggestions: [],
      },
    });
    const existingSnapshot = await knowledge.upsertKnowledgeSourceVersion({
      domain: existing.domain,
      knowledgeType: existing.noteType,
      title: existing.title,
      bodyMarkdown: existing.bodyMarkdown,
      structuredData: existing.structuredData,
      compiledNoteId: existing.id,
      proposalId: "proposal-original",
      changeSummary: "Initial bystander-effect explanation.",
      blocks: [{ blockIndex: 0, heading: null, bodyMarkdown: existing.bodyMarkdown, tokenEstimate: 18 }],
    });
    const proposal = await proposals.create({
      draft: {
        detectedDomain: "general",
        detectedKnowledgeType: "knowledge_note",
        impactLevel: 2,
        confidence: "high",
        rationale: "Recommended: Update existing knowledge.",
        items: [
          {
            actionType: "upsert_knowledge",
            targetType: "knowledge_source",
            payload: {
              domain: "general",
              knowledgeType: "knowledge_note",
              title: "Bystander Effect",
              bodyMarkdown: mergedBody,
              targetCompiledNoteId: existing.id,
              targetKnowledgeSourceId: existingSnapshot.source.id,
              structuredData: {
                summary: "The bystander effect reduces helping when others are present, with a train-station example.",
                concepts: [
                  { name: "bystander effect", type: "topic", specificity: "specific", confidence: "high" },
                  { name: "diffusion of responsibility", type: "term", specificity: "specific", confidence: "high" },
                  { name: "pluralistic ignorance", type: "term", specificity: "specific", confidence: "high" },
                ],
                claims: [
                  {
                    text: "The bystander effect is driven by diffusion of responsibility and pluralistic ignorance.",
                    confidence: "high",
                    evidenceChunkIds: [existingSnapshot.blocks[0].id],
                  },
                  {
                    text: "A train-station scenario can illustrate the bystander effect.",
                    confidence: "high",
                    evidenceChunkIds: ["raw-source-1-chunk-0"],
                  },
                ],
                methods: [],
                examples: [
                  {
                    title: "Train-station bystander scenario",
                    text: exampleBody,
                    illustrates: ["bystander effect", "diffusion of responsibility", "pluralistic ignorance"],
                  },
                ],
                constraints: [],
                inferredSuggestions: [],
              },
            },
            rationale: "The agent merged the existing definition with the train-station example.",
          },
        ],
      },
    });

    await service.approveProposal(proposal.id);

    expect(knowledge.compiledNotes).toHaveLength(1);
    expect(knowledge.compiledNotes[0].bodyMarkdown).toBe(mergedBody);
    expect(knowledge.knowledgeVersions).toHaveLength(2);
    expect(knowledge.knowledgeVersions[1].bodyMarkdown).toBe(mergedBody);
    expect(knowledge.compiledNotes[0].structuredData).toMatchObject({
      examples: [expect.objectContaining({ title: "Train-station bystander scenario" })],
      concepts: expect.arrayContaining([
        expect.objectContaining({ name: "bystander effect" }),
        expect.objectContaining({ name: "diffusion of responsibility" }),
        expect.objectContaining({ name: "pluralistic ignorance" }),
      ]),
    });
  });
});
