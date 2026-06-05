import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";
import { InMemoryExtractionEvalRepository } from "./support/inMemoryExtractionEval.repository.js";

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
      // Deterministic offline judge so the test never hits the network.
      linkJudge: async () => ({
        should_link: true,
        relation_type: "related_concept",
        confidence: "medium",
        rationale: "Both cover BFS shortest path.",
        source_evidence: [],
        target_evidence: [],
      }),
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
    expect(detailResponse.body.events)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          category: "lifecycle",
          name: "queued",
        }),
        expect.objectContaining({
          category: "lifecycle",
          name: "started",
        }),
        expect.objectContaining({
          category: "lifecycle",
          name: "completed",
        }),
      ]));
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
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const agentRunRepository = new InMemoryAgentRunRepository();
      const rawNoteRepository = new InMemoryRawNoteRepository();
      const rawSourceRepository = new InMemoryRawSourceRepository();
      const proposalRepository = new InMemoryProposalRepository();
      const body = "Dijkstra needs extra state for k stops: dist[n][k+2].";
      const rawSource = await rawSourceRepository.create(
        { title: "K stops shortest path", sourceRole: "personal_note", sourceType: "markdown", bodyMarkdown: body },
        [{ chunkIndex: 0, heading: "K stops shortest path", bodyMarkdown: body, tokenEstimate: 9 }],
      );
      const app = createApp({
        agentRunRepository,
        rawNoteRepository,
        rawSourceRepository,
        proposalRepository,
        knowledgeRepository: new InMemoryKnowledgeRepository(),
        noteLinkRepository: new InMemoryNoteLinkRepository(),
      });

      const response = await request(app)
        .post("/agent-runs")
        .send({ runType: "compile_raw_note", input: { rawSourceId: rawSource.id } });

      expect(response.status).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(proposalRepository.proposals).toHaveLength(0);
      expect(agentRunRepository.agentRuns[0]).toMatchObject({
        runType: "compile_raw_note",
        status: "failed",
        error: "OPENAI_API_KEY is required for LLM wiki indexing",
      });
    } finally {
      if (originalOpenAIKey) {
        process.env.OPENAI_API_KEY = originalOpenAIKey;
      }
      consoleError.mockRestore();
    }
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
          category: "lifecycle",
          name: "retry_queued",
        }),
        expect.objectContaining({
          agentRunId: response.body.agentRun.id,
          category: "lifecycle",
          name: "retry_of",
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

  test("GET /agent-runs/:id/eval-result returns extraction eval for the run", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const extractionEvalRepository = new InMemoryExtractionEvalRepository();
    const agentRun = await agentRunRepository.enqueue({
      runType: "compile_raw_note",
      input: { rawNoteId: "raw-note-1" },
    });
    await extractionEvalRepository.create({
      agentRunId: agentRun.id,
      sourceId: "raw-source-1",
      verdict: "warn",
      coverageScore: 0.75,
      groundingScore: 0.5,
      warnings: [
        {
          type: "ungrounded",
          message: "One item needs evidence.",
          severity: "high",
          affected_item_index: 0,
        },
      ],
      rawJudgeOutput: {
        summary: "Proposal needs review before approval.",
      },
    });
    const app = createApp({
      agentRunRepository,
      extractionEvalRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository: new InMemoryNoteLinkRepository(),
    });

    const response = await request(app).get(`/agent-runs/${agentRun.id}/eval-result`);

    expect(response.status).toBe(200);
    expect(response.body.extractionEval).toMatchObject({
      agentRunId: agentRun.id,
      sourceId: "raw-source-1",
      verdict: "warn",
      coverageScore: 0.75,
      groundingScore: 0.5,
      warnings: [
        expect.objectContaining({
          type: "ungrounded",
          message: "One item needs evidence.",
        }),
      ],
      rawJudgeOutput: {
        summary: "Proposal needs review before approval.",
      },
    });
  });
});
