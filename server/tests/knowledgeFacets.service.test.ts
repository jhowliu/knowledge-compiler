import {
  normalizeKnowledgeStructuredData,
  renderKnowledgeFacetsMarkdown,
} from "../src/services/knowledgeFacets.service.js";

describe("knowledge facets service", () => {
  test("keeps inferred suggestions out of approved markdown", () => {
    const facets = normalizeKnowledgeStructuredData({
      summary: "The source only says the user was confused.",
      concepts: [],
      claims: [
        {
          text: "The user was confused.",
          confidence: "high",
          evidenceChunkIds: ["chunk-1"],
        },
      ],
      methods: [],
      examples: [],
      constraints: [],
      inferredSuggestions: [
        {
          text: "Maybe add a Dijkstra tutorial later.",
          reason: "Likely relevant but unsupported by the source.",
          confidence: "low",
        },
      ],
    });

    const markdown = renderKnowledgeFacetsMarkdown(facets);

    expect(facets.inferredSuggestions).toHaveLength(1);
    expect(markdown).toContain("The source only says the user was confused.");
    expect(markdown).toContain("The user was confused.");
    expect(markdown).not.toContain("Dijkstra tutorial");
  });
});
