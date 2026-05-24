import request from "supertest";
import { createApp } from "../src/app.js";
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
});
