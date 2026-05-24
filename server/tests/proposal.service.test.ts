import { ProposalService } from "../src/services/proposal.service.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";

describe("ProposalService", () => {
  test("approves proposal items into compiled knowledge, mistakes, tasks, and readiness", async () => {
    const proposals = new InMemoryProposalRepository();
    const knowledge = new InMemoryKnowledgeRepository();
    const service = new ProposalService(proposals, knowledge);
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
});
