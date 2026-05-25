import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";

describe("agent run routes", () => {
  test("enqueues a reindex_links run and lists recent agent activity", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    await knowledgeRepository.upsertCompiledNote({
      domain: "coding",
      noteType: "algorithm",
      title: "BFS shortest path",
      bodyMarkdown: "BFS solves unweighted shortest path with graph levels.",
      structuredData: {},
    });
    await knowledgeRepository.upsertCompiledNote({
      domain: "coding",
      noteType: "review_map",
      title: "Shortest path review map",
      bodyMarkdown: "Use BFS for unweighted shortest path and Dijkstra for positive weights.",
      structuredData: {},
    });

    const app = createApp({
      agentRunRepository,
      knowledgeRepository,
      noteLinkRepository,
    });

    const response = await request(app)
      .post("/agent-runs")
      .send({ runType: "reindex_links" });

    expect(response.status).toBe(202);
    expect(response.body.agentRun).toMatchObject({
      runType: "reindex_links",
      status: "queued",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const listResponse = await request(app).get("/agent-runs");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.agentRuns[0]).toMatchObject({
      runType: "reindex_links",
      status: "completed",
    });
    expect(noteLinkRepository.noteLinks).toHaveLength(1);
  });

  test("rejects unsupported run types", async () => {
    const app = createApp({
      agentRunRepository: new InMemoryAgentRunRepository(),
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
    });

    const response = await request(app)
      .post("/agent-runs")
      .send({ runType: "organize_board" });

    expect(response.status).toBe(400);
  });

  test("enqueues compile_raw_note and produces a proposal", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const rawNote = await rawNoteRepository.create({
      title: "K stops shortest path",
      bodyMarkdown: "Dijkstra needs extra state for k stops: dist[n][k+2].",
    });
    const app = createApp({
      agentRunRepository,
      rawNoteRepository,
      proposalRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
    });

    const response = await request(app)
      .post("/agent-runs")
      .send({ runType: "compile_raw_note", input: { rawNoteId: rawNote.id } });

    expect(response.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(proposalRepository.proposals).toHaveLength(1);
    expect(agentRunRepository.agentRuns[0]).toMatchObject({
      runType: "compile_raw_note",
      status: "completed",
    });
  });
});
