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
        detectedKnowledgeType: "review_map",
        impactLevel: 4,
        confidence: "high",
        rationale: "Detected review map.",
        items: [
          {
            actionType: "upsert_compiled_note",
            targetType: "compiled_note",
            payload: {
              domain: "coding",
              noteType: "review_map",
              title: "Shortest Path Decision Guide",
              bodyMarkdown: "Weight = 1 -> BFS",
              structuredData: {
                concepts: [{ name: "BFS", conceptType: "algorithm" }],
              },
            },
            rationale: "Create review map.",
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
