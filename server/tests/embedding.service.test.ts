import { embedKnowledgeBlock, type EmbeddingService } from "../src/services/embedding.service.js";

function capturingService() {
  const calls: string[] = [];
  const service: EmbeddingService = {
    async embedText(text) {
      calls.push(text);
      return [0];
    },
  };
  return { service, calls };
}

describe("embedKnowledgeBlock contextual retrieval", () => {
  test("prepends the section path so a small chunk keeps parent context", async () => {
    const { service, calls } = capturingService();

    await embedKnowledgeBlock(service, {
      id: "block-1",
      heading: "Examples",
      bodyMarkdown: "- Koko eating bananas",
      metadata: { sectionPath: ["Binary Search on Answer", "Examples"] },
    });

    expect(calls[0]).toBe("Binary Search on Answer › Examples\n\n- Koko eating bananas");
  });

  test("falls back to the heading when no section path is stored", async () => {
    const { service, calls } = capturingService();

    await embedKnowledgeBlock(service, {
      id: "block-2",
      heading: "Retrieval",
      bodyMarkdown: "RAG answers cite approved knowledge blocks.",
      metadata: {},
    });

    expect(calls[0]).toBe("Retrieval\n\nRAG answers cite approved knowledge blocks.");
  });

  test("embeds the body alone when there is no path or heading", async () => {
    const { service, calls } = capturingService();

    await embedKnowledgeBlock(service, {
      id: "block-3",
      heading: null,
      bodyMarkdown: "A standalone fact.",
    });

    expect(calls[0]).toBe("A standalone fact.");
  });
});
