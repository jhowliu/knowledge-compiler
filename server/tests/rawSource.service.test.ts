import { RawSourceService } from "../src/services/rawSource.service.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

describe("RawSourceService source-tier embeddings (#143)", () => {
  test("embeds source chunks on create when an embedding service is available", async () => {
    const repository = new InMemoryRawSourceRepository();
    const service = new RawSourceService(repository, null, null, null, {
      async embedText() {
        return [0, 1, 0];
      },
    });

    const source = await service.createRawSource({
      bodyMarkdown: "First paragraph about retrieval.\n\nSecond paragraph about chunking.",
      title: "Notes",
    });

    expect(source.chunks.length).toBeGreaterThan(0);
    for (const chunk of source.chunks) {
      expect(repository.chunkEmbeddings.get(chunk.id)).toEqual([0, 1, 0]);
    }
  });

  test("creates sources without embeddings when no embedding service is configured", async () => {
    const repository = new InMemoryRawSourceRepository();
    const service = new RawSourceService(repository);

    const source = await service.createRawSource({
      bodyMarkdown: "A standalone source.",
      title: "Plain",
    });

    expect(source.chunks.length).toBeGreaterThan(0);
    expect(repository.chunkEmbeddings.size).toBe(0);
  });
});
