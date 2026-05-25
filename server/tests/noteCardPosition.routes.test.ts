import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteCardPositionRepository } from "./support/inMemoryNoteCardPosition.repository.js";

describe("note card position routes", () => {
  test("saves and lists whiteboard card positions", async () => {
    const noteCardPositionRepository = new InMemoryNoteCardPositionRepository();
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteCardPositionRepository,
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app)
      .put("/note-card-positions/11111111-1111-4111-8111-111111111111")
      .send({
        x: 35.25,
        y: 62.5,
      });

    expect(response.status).toBe(200);
    expect(response.body.noteCardPosition).toMatchObject({
      boardKey: "default",
      noteId: "11111111-1111-4111-8111-111111111111",
      x: 35.25,
      y: 62.5,
    });

    const listResponse = await request(app).get("/note-card-positions");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.noteCardPositions).toHaveLength(1);
    expect(listResponse.body.noteCardPositions[0]).toMatchObject({
      noteId: "11111111-1111-4111-8111-111111111111",
      x: 35.25,
      y: 62.5,
    });
  });

  test("updates an existing card position on the same board", async () => {
    const noteCardPositionRepository = new InMemoryNoteCardPositionRepository();
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteCardPositionRepository,
      enablePhaseOneWorkflow: false,
    });

    await request(app)
      .put("/note-card-positions/11111111-1111-4111-8111-111111111111")
      .send({ x: 20, y: 30 });
    const response = await request(app)
      .put("/note-card-positions/11111111-1111-4111-8111-111111111111")
      .send({ x: 44, y: 55 });

    expect(response.status).toBe(200);
    expect(response.body.noteCardPosition).toMatchObject({ x: 44, y: 55 });
    expect(noteCardPositionRepository.noteCardPositions).toHaveLength(1);
  });

  test("keeps positions separate per board and resets one board", async () => {
    const noteCardPositionRepository = new InMemoryNoteCardPositionRepository();
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteCardPositionRepository,
      enablePhaseOneWorkflow: false,
    });

    await request(app)
      .put("/note-card-positions/11111111-1111-4111-8111-111111111111")
      .send({ boardKey: "default", x: 20, y: 30 });
    await request(app)
      .put("/note-card-positions/11111111-1111-4111-8111-111111111111")
      .send({ boardKey: "review-maps", x: 64, y: 42 });

    const reviewMapResponse = await request(app).get("/note-card-positions?boardKey=review-maps");

    expect(reviewMapResponse.status).toBe(200);
    expect(reviewMapResponse.body.noteCardPositions).toHaveLength(1);
    expect(reviewMapResponse.body.noteCardPositions[0]).toMatchObject({
      boardKey: "review-maps",
      x: 64,
      y: 42,
    });

    const resetResponse = await request(app).delete("/note-card-positions?boardKey=review-maps");

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.result).toMatchObject({ boardKey: "review-maps", deletedCount: 1 });

    const defaultResponse = await request(app).get("/note-card-positions");
    expect(defaultResponse.body.noteCardPositions).toHaveLength(1);
    expect(defaultResponse.body.noteCardPositions[0]).toMatchObject({ boardKey: "default" });

    const emptyReviewMapResponse = await request(app).get("/note-card-positions?boardKey=review-maps");
    expect(emptyReviewMapResponse.body.noteCardPositions).toHaveLength(0);
  });

  test("rejects positions outside the canvas bounds", async () => {
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteCardPositionRepository: new InMemoryNoteCardPositionRepository(),
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app)
      .put("/note-card-positions/11111111-1111-4111-8111-111111111111")
      .send({ x: -1, y: 50 });

    expect(response.status).toBe(400);
  });
});
