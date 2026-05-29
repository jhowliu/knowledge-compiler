import { RawNoteService } from "../src/services/rawNote.service.js";
import { InMemoryRawNoteRepository } from "./support/inMemoryRawNote.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

describe("RawNoteService", () => {
  test("creates a raw note with service-level defaults", async () => {
    const repository = new InMemoryRawNoteRepository();
    const service = new RawNoteService(repository);

    const result = await service.createRawNote({
      title: "Floyd-Warshall miss",
      bodyMarkdown: "I missed that this was an all-pairs shortest path problem.",
    });

    expect(result.rawNote.sourceType).toBe("manual");
    expect(result.rawNote.sourceRole).toBe("personal_note");
    expect(result.rawNote.title).toBe("Floyd-Warshall miss");
    expect(result.rawNote.bodyMarkdown).toBe(
      "I missed that this was an all-pairs shortest path problem.",
    );
  });

  test("creates a bridged raw source and chunks when configured", async () => {
    const rawNoteRepository = new InMemoryRawNoteRepository();
    const rawSourceRepository = new InMemoryRawSourceRepository();
    const service = new RawNoteService(
      rawNoteRepository,
      null,
      null,
      null,
      null,
      rawSourceRepository,
    );

    const result = await service.createRawNote({
      sourceRole: "reference",
      sourceType: "paper",
      title: "LLM paper notes",
      bodyMarkdown: "# Retrieval\n\nRAG answers should cite approved knowledge.",
    });

    expect(result.rawNote.sourceRole).toBe("reference");
    expect(result.rawNote.rawSourceId).toBe("raw-source-1");
    expect(rawSourceRepository.sources).toHaveLength(1);
    expect(rawSourceRepository.sources[0]).toMatchObject({
      sourceRole: "reference",
      sourceType: "paper",
      title: "LLM paper notes",
    });
    expect(rawSourceRepository.sources[0].chunks).toHaveLength(1);
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
