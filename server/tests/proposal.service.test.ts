import { ProposalService } from "../src/services/proposal.service.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";

describe("ProposalService", () => {
  test("approves proposal items into compiled knowledge, mistakes, tasks, and readiness", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const noteLinks = new InMemoryNoteLinkRepository();
    const service = new ProposalService(proposals, knowledge, noteLinks);
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
          {
            actionType: "create_mistake",
            targetType: "mistake",
            payload: {
              domain: "coding",
              category: "Shortest Path",
              title: "Missed all-pairs shortest path",
              description: "Missed all-pairs shortest path",
            },
            rationale: "Track mistake.",
          },
          {
            actionType: "create_review_task",
            targetType: "review_task",
            payload: {
              domain: "coding",
              title: "Practice APSP",
              description: "Practice two APSP problems.",
            },
            rationale: "Create review task.",
          },
          {
            actionType: "upsert_readiness",
            targetType: "readiness_item",
            payload: {
              domain: "coding",
              area: "All-Pairs Shortest Path",
              status: "Weak",
              rationale: "Missed recognition signal.",
            },
            rationale: "Update readiness.",
          },
        ],
      },
    });

    const approved = await service.approveProposal(proposal.id);

    expect(approved.status).toBe("approved");
    expect(knowledge.compiledNotes).toHaveLength(1);
    expect(knowledge.mistakes).toHaveLength(1);
    expect(knowledge.reviewTasks).toHaveLength(1);
    expect(knowledge.readinessItems).toHaveLength(1);
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
});
