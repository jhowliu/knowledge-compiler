import { AgentRunQueueService } from "../src/services/agentRunQueue.service.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";

describe("agent run queue service", () => {
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

  test("runs compile_raw_note with wiki-style variant indexing", async () => {
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
      provider: "deterministic",
      detectedKnowledgeType: "general_coding_note",
    });
    expect(proposalRepository.proposals).toHaveLength(1);
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
});
