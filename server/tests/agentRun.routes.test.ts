import { jest } from "@jest/globals";
import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";
import { InMemoryExtractionEvalRepository } from "./support/inMemoryExtractionEval.repository.js";

describe("agent run routes", () => {
  test("lists recent agent activity and returns run detail", async () => {
    const agentRunRepository = new InMemoryAgentRunRepository();
    const run = await agentRunRepository.enqueue({
      runType: "compile_raw_note",
      input: { rawSourceId: "source-1" },
    });
    await agentRunRepository.complete(run.id, {});
    const app = createApp({
      agentRunRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
    });

    const listResponse = await request(app).get("/agent-runs");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.agentRuns[0]).toMatchObject({
      id: run.id,
      runType: "compile_raw_note",
      status: "completed",
    });

    const detailResponse = await request(app).get(`/agent-runs/${run.id}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.agentRun).toMatchObject({ id: run.id, status: "completed" });
  });

  test("rejects unsupported run types", async () => {
    const app = createApp({
      agentRunRepository: new InMemoryAgentRunRepository(),
      knowledgeRepository: new InMemoryKnowledgeRepository(),
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
      const rawSourceRepository = new InMemoryRawSourceRepository();
      const proposalRepository = new InMemoryProposalRepository();
      const body = "Dijkstra needs extra state for k stops: dist[n][k+2].";
      const rawSource = await rawSourceRepository.create(
        { title: "K stops shortest path", sourceRole: "personal_note", sourceType: "markdown", bodyMarkdown: body },
        [{ chunkIndex: 0, heading: "K stops shortest path", bodyMarkdown: body, tokenEstimate: 9 }],
      );
      const app = createApp({
        agentRunRepository,
        rawSourceRepository,
        proposalRepository,
        knowledgeRepository: new InMemoryKnowledgeRepository(),
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
      runType: "compile_raw_note",
      input: { rawSourceId: "source-1" },
    });
    await agentRunRepository.fail(failedRun.id, "Temporary failure");
    const app = createApp({
      agentRunRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
    });

    const response = await request(app).post(`/agent-runs/${failedRun.id}/retry`);

    expect(response.status).toBe(202);
    expect(response.body.agentRun).toMatchObject({
      runType: "compile_raw_note",
      status: "queued",
      input: {
        rawSourceId: "source-1",
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
      runType: "compile_raw_note",
      input: {},
    });
    await agentRunRepository.complete(completedRun.id, {});
    const app = createApp({
      agentRunRepository,
      knowledgeRepository: new InMemoryKnowledgeRepository(),
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
