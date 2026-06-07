import type { VerifyGroundingInput } from "@knowledge-compiler/agent-contracts";
import { AgentToolService } from "../src/services/agentTool.service.js";
import { InMemoryExtractionEvalRepository } from "./support/inMemoryExtractionEval.repository.js";
import { InMemoryKnowledgeRepository } from "./support/inMemoryKnowledge.repository.js";
import { InMemoryProposalRepository } from "./support/inMemoryProposal.repository.js";
import { InMemoryRawSourceRepository } from "./support/inMemoryRawSource.repository.js";

const chunkBody = "Scan the merged array from the end to avoid overwriting unprocessed values.";

function makeService() {
  const extractionEvalRepository = new InMemoryExtractionEvalRepository();
  const service = new AgentToolService(
    new InMemoryRawSourceRepository(),
    new InMemoryKnowledgeRepository(),
    new InMemoryProposalRepository(),
    extractionEvalRepository,
    {
      getBlock: async () => null,
      getBlockHistory: async () => ({ versions: [] }),
      lookupConcepts: async () => ({ matches: [] }),
    },
  );
  return { service, extractionEvalRepository };
}

const chunks = [{ id: "chunk-1", chunk_index: 0, body_markdown: chunkBody }];

function facets(overrides: {
  claims?: Array<{ text: string; evidenceChunkIds: string[] }>;
  inferredSuggestions?: Array<{ text: string }>;
}) {
  return {
    summary: "s",
    concepts: [],
    claims: (overrides.claims ?? []).map((claim) => ({ ...claim, confidence: "high" as const })),
    methods: [],
    examples: [],
    constraints: [],
    inferredSuggestions: (overrides.inferredSuggestions ?? []).map((suggestion) => ({
      ...suggestion,
      reason: "agent inference",
      confidence: "medium" as const,
    })),
  };
}

describe("verify_grounding tool", () => {
  test("reports a verbatim_span offset mismatch with actual_text the agent can fix", () => {
    const { service } = makeService();
    const input: VerifyGroundingInput = {
      items: [
        {
          body_markdown: "Backward fill.",
          // char_end one short → slice differs from text.
          source_spans: [{ chunk_index: 0, char_start: 0, char_end: 4, text: "Scan the" }],
        },
      ],
    };
    const result = service.verifyGrounding({ chunks }, input);

    expect(result.ok).toBe(false);
    const failure = result.items[0].failures.find((f) => f.check === "verbatim_span");
    expect(failure).toBeDefined();
    expect(failure?.actual_text).toBe("Scan");
    expect(failure?.valid_chunk_indexes).toEqual([0]);
  });

  test("flags missing evidence and unknown chunk ids (with the valid id set)", () => {
    const { service } = makeService();
    const result = service.verifyGrounding(
      { chunks },
      {
        items: [
          {
            body_markdown: "note",
            source_spans: [],
            structured_facets: facets({
              claims: [
                { text: "no evidence claim", evidenceChunkIds: [] },
                { text: "bad id claim", evidenceChunkIds: ["chunk-zzz"] },
              ],
            }),
          },
        ],
      },
    );

    expect(result.ok).toBe(false);
    const checks = result.items[0].failures.map((f) => f.check);
    expect(checks).toContain("missing_evidence");
    const unknown = result.items[0].failures.find((f) => f.check === "unknown_chunk_id");
    expect(unknown?.chunk_id).toBe("chunk-zzz");
    expect(unknown?.valid_chunk_ids).toEqual(["chunk-1"]);
  });

  test("flags an inferred suggestion that leaked into body_markdown", () => {
    const { service } = makeService();
    const result = service.verifyGrounding(
      { chunks },
      {
        items: [
          {
            body_markdown: "Scan from the end. You could also use memoization here.",
            source_spans: [{ chunk_index: 0, char_start: 0, char_end: chunkBody.length, text: chunkBody }],
            structured_facets: facets({
              claims: [{ text: "scan from the end", evidenceChunkIds: ["chunk-1"] }],
              inferredSuggestions: [{ text: "You could also use memoization here." }],
            }),
          },
        ],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.items[0].failures.map((f) => f.check)).toContain("inferred_suggestion_leak");
  });

  test("a corrected payload passes (self-correction loop), and verify writes nothing", () => {
    const { service, extractionEvalRepository } = makeService();
    const result = service.verifyGrounding(
      { chunks },
      {
        items: [
          {
            body_markdown: "Fill the result backwards so earlier entries stay intact.",
            source_spans: [{ chunk_index: 0, char_start: 0, char_end: chunkBody.length, text: chunkBody }],
            structured_facets: facets({
              claims: [{ text: "scan from the end", evidenceChunkIds: ["chunk-1"] }],
            }),
          },
        ],
      },
    );

    expect(result.ok).toBe(true);
    expect(result.items[0].failures).toHaveLength(0);
    // Pure pre-flight: no extraction_evals recorded.
    expect(extractionEvalRepository.extractionEvals).toHaveLength(0);
  });
});
