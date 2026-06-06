import type { QueryConceptExtractor } from "../src/services/queryConcept.service.js";
import { QueryConceptResolutionService, normalizeQueryConcepts } from "../src/services/queryConcept.service.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";

describe("query concept resolution", () => {
  test("normalizes structured extractor output", () => {
    expect(
      normalizeQueryConcepts({
        concepts: [
          { text: " RRF ", aliases: [" Reciprocal Rank Fusion ", ""], confidence: "high" },
          { text: "", aliases: ["ignored"], confidence: "high" },
          { text: "hybrid search", aliases: "not-array", confidence: "unknown" },
        ],
      }),
    ).toEqual([
      { text: "RRF", aliases: ["Reciprocal Rank Fusion"], confidence: "high" },
      { text: "hybrid search", aliases: [], confidence: "medium" },
    ]);
  });

  test("resolves query aliases to canonical concept ids", async () => {
    const knowledgeRepository = new InMemoryKnowledgeRepository();
    const concept = await knowledgeRepository.upsertConcept({
      name: "Reciprocal Rank Fusion",
      conceptType: "retrieval_strategy",
    });
    await knowledgeRepository.upsertConceptAlias({
      conceptId: concept.id,
      alias: "RRF",
      confidence: "high",
    });

    const extractor = {
      async extract() {
        return [
          {
            text: "RRF",
            aliases: ["reciprocal rank fusion"],
            confidence: "high",
          },
        ];
      },
    } satisfies QueryConceptExtractor;
    const resolver = new QueryConceptResolutionService(knowledgeRepository, extractor);

    await expect(resolver.resolve({ query: "why does RRF help hybrid search?" })).resolves.toEqual([
      {
        conceptId: concept.id,
        canonicalLabel: "Reciprocal Rank Fusion",
        matchedText: "RRF",
        matchedAlias: "RRF",
        matchType: "alias",
        confidence: "high",
      },
    ]);
  });
});
