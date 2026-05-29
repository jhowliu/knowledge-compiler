import request from "supertest";
import { createApp } from "../src/app.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

describe("raw source routes", () => {
  test("POST /sources stores a reference source with chunks", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app).post("/sources").send({
      sourceRole: "reference",
      sourceType: "paper",
      title: "Attention Is All You Need",
      bodyMarkdown: "# Transformer\n\nSelf-attention replaces recurrence.",
    });

    expect(response.status).toBe(201);
    expect(response.body.rawSource).toMatchObject({
      sourceRole: "reference",
      sourceType: "paper",
      title: "Attention Is All You Need",
    });
    expect(response.body.rawSource.chunks).toHaveLength(1);
    expect(response.body.rawSource.chunks[0]).toMatchObject({
      chunkIndex: 0,
      heading: "Transformer",
    });
  });

  test("POST /sources rejects unsupported source roles", async () => {
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const app = createApp({
      rawSourceRepository,
      enablePhaseOneWorkflow: false,
    });

    const response = await request(app).post("/sources").send({
      sourceRole: "review_task",
      title: "Nope",
      bodyMarkdown: "This role should not be accepted.",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
    expect(rawSourceRepository.sources).toHaveLength(0);
  });
});
