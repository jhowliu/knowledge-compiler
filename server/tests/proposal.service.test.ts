import { ProposalService } from "../src/services/proposal.service.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";

describe("ProposalService", () => {
  test("approves proposal items into compiled and canonical knowledge", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);
    knowledge.rawNoteChunkIdsByRawNoteId.set("raw-note-1", ["raw-source-chunk-1", "raw-source-chunk-2"]);
    const proposal = await proposals.create({
      rawNoteId: "raw-note-1",
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

  test("creates pending note link suggestions for related compiled notes", async () => {
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
      rawNoteId: "raw-note-1",
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

    expect(noteLinks.noteLinks).toHaveLength(1);
    expect(noteLinks.noteLinks[0]).toMatchObject({
      sourceNoteId: "compiled-1",
      targetNoteId: "compiled-existing-1",
      relationType: "related_concept",
      status: "pending",
      confidence: "high",
    });
  });

  test("creates a new knowledge version and archives old blocks on repeated approval", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);

    const firstProposal = await proposals.create({
      rawNoteId: "raw-note-1",
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
      rawNoteId: "raw-note-2",
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
      rawNoteId: "raw-note-embedding",
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

  test("renders approved markdown from generalized facets instead of trusting payload markdown", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);

    const proposal = await proposals.create({
      rawNoteId: "raw-note-facets",
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
              bodyMarkdown: "LLM-written markdown that should not be trusted.",
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

    expect(knowledge.compiledNotes[0].bodyMarkdown).toContain("## Summary");
    expect(knowledge.compiledNotes[0].bodyMarkdown).toContain("## Claims");
    expect(knowledge.compiledNotes[0].bodyMarkdown).toContain("Facet-first approval");
    expect(knowledge.compiledNotes[0].bodyMarkdown).not.toContain("LLM-written markdown");
    expect(knowledge.compiledNotes[0].bodyMarkdown).not.toContain("authoring guidelines");
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
      rawNoteId: "raw-note-3",
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
});
