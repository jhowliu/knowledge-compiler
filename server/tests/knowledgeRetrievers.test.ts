import { PostgresBm25Retriever } from "../src/repositories/knowledgeRetrievers.js";

describe("PostgresBm25Retriever", () => {
  test("reports disabled when pg_search is unavailable", async () => {
    const retriever = new PostgresBm25Retriever(async () => ({
      enabled: false,
      reason: "missing_pg_search_extension",
    }));

    await expect(retriever.search({ query: "RRF", limit: 8 })).resolves.toEqual({
      source: "bm25",
      status: "disabled",
      reason: "missing_pg_search_extension",
      candidates: [],
    });
  });

  test("reports disabled when the BM25 index is missing", async () => {
    const retriever = new PostgresBm25Retriever(async () => ({
      enabled: false,
      reason: "missing_bm25_index",
    }));

    await expect(retriever.search({ query: "source_spans", limit: 8 })).resolves.toEqual({
      source: "bm25",
      status: "disabled",
      reason: "missing_bm25_index",
      candidates: [],
    });
  });
});
