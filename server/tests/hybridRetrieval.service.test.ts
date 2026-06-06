import { mergeRetrievalCandidateSets } from "../src/services/retrieval/hybridRetrieval.service.js";
import type { RetrievalCandidateSet } from "../src/services/retrieval/retrieval.types.js";

describe("hybrid retrieval merge", () => {
  test("deduplicates blocks and sums RRF contributions across retrievers", () => {
    const fts = {
      source: "fts",
      status: "enabled",
      candidates: [
        { blockId: "block-a", source: "fts", rankPosition: 1, score: 0.9 },
        { blockId: "block-b", source: "fts", rankPosition: 2, score: 0.7 },
      ],
    } satisfies RetrievalCandidateSet;
    const concept = {
      source: "concept",
      status: "enabled",
      candidates: [
        { blockId: "block-b", source: "concept", rankPosition: 1, score: 3 },
        { blockId: "block-c", source: "concept", rankPosition: 2, score: 2 },
      ],
    } satisfies RetrievalCandidateSet;
    const bm25 = {
      source: "bm25",
      status: "enabled",
      candidates: [{ blockId: "block-a", source: "bm25", rankPosition: 1, score: 4.2 }],
    } satisfies RetrievalCandidateSet;

    const result = mergeRetrievalCandidateSets([fts, concept, bm25], 60);

    expect(result.candidates.map((candidate) => candidate.blockId)).toEqual([
      "block-a",
      "block-b",
      "block-c",
    ]);
    expect(result.candidates[0]?.contributions.map((contribution) => contribution.source)).toEqual([
      "fts",
      "bm25",
    ]);
    expect(result.trace.sources).toEqual([
      { source: "fts", status: "enabled", reason: undefined, candidateCount: 2 },
      { source: "concept", status: "enabled", reason: undefined, candidateCount: 2 },
      { source: "bm25", status: "enabled", reason: undefined, candidateCount: 1 },
    ]);
  });

  test("records disabled retrievers without contributing candidates", () => {
    const fts = {
      source: "fts",
      status: "enabled",
      candidates: [{ blockId: "block-a", source: "fts", rankPosition: 1 }],
    } satisfies RetrievalCandidateSet;
    const vector = {
      source: "vector",
      status: "disabled",
      reason: "missing_query_embedding",
      candidates: [],
    } satisfies RetrievalCandidateSet;

    const result = mergeRetrievalCandidateSets([fts, vector]);

    expect(result.candidates).toHaveLength(1);
    expect(result.trace.sources).toContainEqual({
      source: "vector",
      status: "disabled",
      reason: "missing_query_embedding",
      candidateCount: 0,
    });
  });
});
