import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryAgentRunRepository } from "./support/inMemoryAgentRun.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";

describe("raw note routes", () => {
  test("POST /raw-notes returns 201 for a valid payload", async () => {
    const repository = new InMemoryRawNoteRepository();
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).post("/raw-notes").send({
      title: "Stack with state",
      bodyMarkdown: "I missed the mutable counter stack pattern.",
    });

    expect(response.status).toBe(201);
    expect(response.body.rawNote.title).toBe("Stack with state");
    expect(response.body.rawNote.sourceType).toBe("manual");
    expect(response.body.proposal).toBeNull();
    expect(repository.notes).toHaveLength(1);
  });

  test("POST /raw-notes returns 400 for an invalid payload", async () => {
    const repository = new InMemoryRawNoteRepository();
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).post("/raw-notes").send({
      bodyMarkdown: "",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(repository.notes).toHaveLength(0);
  });

  test("PATCH /raw-notes/:id updates an existing raw note", async () => {
    const repository = new InMemoryRawNoteRepository();
    const rawNote = await repository.create({
      title: "Old title",
      bodyMarkdown: "Old body",
    });
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).patch(`/raw-notes/${rawNote.id}`).send({
      title: "Updated title",
      bodyMarkdown: "Updated body",
    });

    expect(response.status).toBe(200);
    expect(response.body.rawNote.title).toBe("Updated title");
    expect(response.body.rawNote.bodyMarkdown).toBe("Updated body");
    expect(repository.notes).toHaveLength(1);
  });

  test("PATCH /raw-notes/:id returns 404 when the note does not exist", async () => {
    const repository = new InMemoryRawNoteRepository();
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).patch("/raw-notes/missing").send({
      title: "Missing",
      bodyMarkdown: "Still missing",
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Raw note not found");
  });

  test("PATCH /raw-notes/:id returns 400 for an invalid update", async () => {
    const repository = new InMemoryRawNoteRepository();
    const rawNote = await repository.create({
      title: "Old title",
      bodyMarkdown: "Old body",
    });
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).patch(`/raw-notes/${rawNote.id}`).send({
      title: "Updated title",
      bodyMarkdown: "",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
  });

  test("DELETE /raw-notes/:id removes an existing raw note", async () => {
    const repository = new InMemoryRawNoteRepository();
    const rawNote = await repository.create({
      title: "Delete me",
      bodyMarkdown: "Temporary note",
    });
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).delete(`/raw-notes/${rawNote.id}`);

    expect(response.status).toBe(204);
    expect(repository.notes).toHaveLength(0);
  });

  test("DELETE /raw-notes/:id returns 404 when the note does not exist", async () => {
    const repository = new InMemoryRawNoteRepository();
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).delete("/raw-notes/missing");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Raw note not found");
  });

  test("POST /raw-notes/:id/compile compiles an existing raw note", async () => {
    const repository = new InMemoryRawNoteRepository();
    const rawNote = await repository.create({
      title: "Compile me",
      bodyMarkdown: "Practice note",
    });
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).post(`/raw-notes/${rawNote.id}/compile`).send({});

    expect(response.status).toBe(200);
    expect(response.body.proposal).toBeNull();
    expect(response.body.agentRunId).toBeNull();
  });

  test("POST /raw-notes/:id/compile returns 404 when the note does not exist", async () => {
    const repository = new InMemoryRawNoteRepository();
    const app = createApp({ rawNoteRepository: repository, enablePhaseOneWorkflow: false });

    const response = await request(app).post("/raw-notes/missing/compile").send({});

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Raw note not found");
  });

  test("GET /raw-notes/:id/indexing-trace returns proposal and agent status", async () => {
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const proposalRepository = new InMemoryProposalRepository();
    const agentRunRepository = new InMemoryAgentRunRepository();
    const rawNote = await rawNoteRepository.create({
      title: "Trace me",
      bodyMarkdown: "I missed Dijkstra with extra state.",
    });
    await proposalRepository.create({
      rawNoteId: rawNote.id,
      draft: {
        detectedDomain: "coding",
        detectedKnowledgeType: "problem_reflection",
        impactLevel: 3,
        confidence: "medium",
        rationale: "Detected coding note.",
        items: [],
      },
    });
    await agentRunRepository.enqueue({
      runType: "compile_raw_note",
      input: { rawNoteId: rawNote.id },
    });
    const app = createApp({
      rawNoteRepository,
      proposalRepository,
      agentRunRepository,
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app).get(`/raw-notes/${rawNote.id}/indexing-trace`);

    expect(response.status).toBe(200);
    expect(response.body.indexingTrace).toMatchObject({
      status: "Indexing",
      rawNote: { id: rawNote.id },
    });
    expect(response.body.indexingTrace.proposals).toHaveLength(1);
    expect(response.body.indexingTrace.agentRuns).toHaveLength(1);
  });
});
