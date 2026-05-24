import { RawNoteService } from "../src/services/rawNote.service.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";

describe("RawNoteService", () => {
  test("creates a raw note with service-level defaults", async () => {
    const repository = new InMemoryRawNoteRepository();
    const service = new RawNoteService(repository);

    const rawNote = await service.createRawNote({
      title: "Floyd-Warshall miss",
      bodyMarkdown: "I missed that this was an all-pairs shortest path problem.",
    });

    expect(rawNote.sourceType).toBe("manual");
    expect(rawNote.title).toBe("Floyd-Warshall miss");
    expect(rawNote.bodyMarkdown).toBe("I missed that this was an all-pairs shortest path problem.");
  });

  test("lists recent raw notes through the repository boundary", async () => {
    const repository = new InMemoryRawNoteRepository();
    const service = new RawNoteService(repository);

    await service.createRawNote({ bodyMarkdown: "First note" });
    await service.createRawNote({ bodyMarkdown: "Second note" });

    const rawNotes = await service.listRecentRawNotes();

    expect(rawNotes.map((note) => note.bodyMarkdown)).toEqual(["Second note", "First note"]);
  });
});
