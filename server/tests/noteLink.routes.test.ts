import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryNoteLinkRepository } from "./support/inMemoryNoteLink.repository.js";

describe("note link routes", () => {
  test("lists graph links and approves pending suggestions", async () => {
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    await noteLinkRepository.createSuggestion({
      sourceNoteType: "compiled_note",
      sourceNoteId: "compiled-1",
      targetNoteType: "compiled_note",
      targetNoteId: "compiled-2",
      relationType: "related_concept",
      confidence: "medium",
      rationale: "Shared shortest path concept.",
    });
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository,
      enablePhaseOneWorkflow: false,
    });

    const listResponse = await request(app).get("/note-links");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.noteLinks).toHaveLength(1);
    expect(listResponse.body.noteLinks[0].status).toBe("pending");

    const approveResponse = await request(app).post("/note-links/note-link-1/approve");

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.noteLink.status).toBe("approved");
  });

  test("lists bidirectional links for a selected note", async () => {
    const noteLinkRepository = new InMemoryNoteLinkRepository();
    await noteLinkRepository.createSuggestion({
      sourceNoteType: "compiled_note",
      sourceNoteId: "compiled-1",
      targetNoteType: "compiled_note",
      targetNoteId: "compiled-2",
      relationType: "related_concept",
      confidence: "medium",
    });
    await noteLinkRepository.createSuggestion({
      sourceNoteType: "compiled_note",
      sourceNoteId: "compiled-3",
      targetNoteType: "compiled_note",
      targetNoteId: "compiled-2",
      relationType: "related_concept",
      confidence: "low",
    });
    const app = createApp({
      knowledgeRepository: new InMemoryKnowledgeRepository(),
      noteLinkRepository,
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app).get("/note-links/notes/compiled-2");

    expect(response.status).toBe(200);
    expect(response.body.noteLinks).toHaveLength(2);
  });
});
