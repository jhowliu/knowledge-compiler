import { jest } from "@jest/globals";
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
      noteType: "knowledge_note",
      title: "Shortest path decision guide",
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

    const detailResponse = await request(app).get(`/agent-runs/${response.body.agentRun.id}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.agentRun).toMatchObject({
      id: response.body.agentRun.id,
      runType: "reindex_links",
      status: "completed",
    });
    expect(detailResponse.body.events.map((event: { eventType: string }) => event.eventType))
      .toEqual(expect.arrayContaining(["queued", "run_started", "run_completed"]));
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

  test("enqueues compile_raw_note and fails without LLM configuration", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
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

    expect(proposalRepository.proposals).toHaveLength(0);
    expect(agentRunRepository.agentRuns[0]).toMatchObject({
      runType: "compile_raw_note",
      status: "failed",
      error: "OPENAI_API_KEY is required for LLM wiki indexing",
    });
    consoleError.mockRestore();
  });

  test("retries a failed agent run with the original input and retry lineage", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const failedRun = await agentRunRepository.enqueue({
      runType: "reindex_links",
      input: { boardKey: "default" },
    });
    await agentRunRepository.fail(failedRun.id, "Temporary failure");
    const app = createApp({
      agentRunRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
    });

    const response = await request(app).post(`/agent-runs/${failedRun.id}/retry`);

    expect(response.status).toBe(202);
    expect(response.body.agentRun).toMatchObject({
      runType: "reindex_links",
      status: "queued",
      input: {
        boardKey: "default",
        retryOfAgentRunId: failedRun.id,
      },
    });
    expect(agentRunRepository.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentRunId: failedRun.id,
          eventType: "retry_queued",
        }),
        expect.objectContaining({
          agentRunId: response.body.agentRun.id,
          eventType: "retry_of",
        }),
      ]),
    );
  });

  test("does not retry a completed agent run", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const completedRun = await agentRunRepository.enqueue({
      runType: "reindex_links",
      input: {},
    });
    await agentRunRepository.complete(completedRun.id, {});
    const app = createApp({
      agentRunRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
    });

    const response = await request(app).post(`/agent-runs/${completedRun.id}/retry`);

    expect(response.status).toBe(400);
    expect(agentRunRepository.agentRuns).toHaveLength(1);
  });
});
