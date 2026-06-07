import { judgeProposalHeuristically } from "../src/services/evalJudge.service.js";

describe("eval judge service", () => {
  test("fails structured claims that cite no evidence chunk", () => {
    const sourceText = "I only wrote that a k-stop path needs dist[n][k+2].";
    const judge = judgeProposalHeuristically({
      source_text: sourceText,
      chunks: [
        {
          id: "chunk-1",
          chunk_index: 0,
          heading: "Sparse note",
          body_markdown: sourceText,
          token_estimate: 12,
        },
      ],
      proposal: {
        indexing_outcome: "create_knowledge",
        outcome_reason: "This fixture tests reusable knowledge grounding.",
        reasoning_summary: "Draft sparse note.",
        incomplete_reasoning: false,
        items: [
          {
            action: "upsert_knowledge",
            target_block_id: null,
            title: "K stop path state",
            body_markdown: sourceText,
            structured_facets: {
              summary: "K-stop paths need an extra state dimension.",
              concepts: [],
              claims: [
                {
                  text: "K-stop paths need dist[n][k+2].",
                  confidence: "high",
                  evidenceChunkIds: [],
                },
              ],
              methods: [],
              examples: [],
              constraints: [],
              inferredSuggestions: [],
            },
            source_concept_ids: [],
            source_spans: [
              {
                chunk_index: 0,
                char_start: 0,
                char_end: sourceText.length,
                text: sourceText,
              },
            ],
            confidence: "high",
            conflict_detected: false,
            conflict_summary: null,
            conflict_resolution: null,
          },
        ],
        suggested_links: [],
      },
      existing_blocks_context: [],
    });

    expect(judge.overall_verdict).toBe("fail");
    expect(judge.grounding[0]).toMatchObject({
      item_index: 0,
      verdict: "ungrounded",
    });
    expect(judge.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ungrounded",
          severity: "high",
          message: expect.stringContaining("has no evidence IDs"),
        }),
      ]),
    );
  });

  test("passes a paraphrase with low lexical overlap (semantic support is judged by the LLM judge, not the lint)", () => {
    const sourceText = "Scan the merged array from the end to avoid overwriting unprocessed values.";
    const judge = judgeProposalHeuristically({
      source_text: sourceText,
      chunks: [
        {
          id: "chunk-1",
          chunk_index: 0,
          heading: "Merge",
          body_markdown: sourceText,
          token_estimate: 14,
        },
      ],
      proposal: {
        indexing_outcome: "create_knowledge",
        outcome_reason: "Reusable technique.",
        reasoning_summary: "Draft note.",
        incomplete_reasoning: false,
        items: [
          {
            action: "upsert_knowledge",
            target_block_id: null,
            title: "Merge direction",
            // Concise paraphrase: low token overlap, but spans + evidence are valid.
            body_markdown: "Fill the result backwards so earlier entries stay intact.",
            structured_facets: {
              summary: "Backward fill keeps unprocessed entries safe.",
              concepts: [],
              claims: [
                {
                  text: "Filling from the back protects values not yet processed.",
                  confidence: "high",
                  evidenceChunkIds: ["chunk-1"],
                },
              ],
              methods: [],
              examples: [],
              constraints: [],
              inferredSuggestions: [],
            },
            source_concept_ids: [],
            source_spans: [
              { chunk_index: 0, char_start: 0, char_end: sourceText.length, text: sourceText },
            ],
            confidence: "high",
            conflict_detected: false,
            conflict_summary: null,
            conflict_resolution: null,
          },
        ],
        suggested_links: [],
      },
      existing_blocks_context: [],
    });

    expect(judge.overall_verdict).toBe("pass");
    expect(judge.grounding[0]).toMatchObject({ item_index: 0, verdict: "grounded" });
  });

  test("allows targeted updates to ground preserved claims in the approved target block", () => {
    const sourceText =
      "At a train station, a passenger sits down looking pale while nearby people wait for someone else to act. This illustrates the bystander effect.";
    const existingBody =
      "People are less likely to help someone in trouble when other people are around. This bystander effect is driven by diffusion of responsibility and pluralistic ignorance.";
    const judge = judgeProposalHeuristically({
      source_text: sourceText,
      chunks: [
        {
          id: "chunk-1",
          chunk_index: 0,
          heading: "Train station",
          body_markdown: sourceText,
          token_estimate: 24,
        },
      ],
      proposal: {
        indexing_outcome: "update_existing_knowledge",
        outcome_reason: "The source adds a concrete example to an existing block.",
        reasoning_summary: "Merged the approved explanation with the new example.",
        incomplete_reasoning: false,
        items: [
          {
            action: "upsert_knowledge",
            target_block_id: "block-bystander",
            title: "Bystander Effect",
            body_markdown: `${existingBody}\n\n## Examples\n${sourceText}`,
            structured_facets: {
              summary: "The bystander effect reduces helping when other people are present.",
              concepts: [],
              claims: [
                {
                  text: "The bystander effect is driven by diffusion of responsibility and pluralistic ignorance.",
                  confidence: "high",
                  evidenceChunkIds: ["block-bystander"],
                },
                {
                  text: "A train-station passenger looking pale while others wait for someone else to act illustrates the bystander effect.",
                  confidence: "high",
                  evidenceChunkIds: ["chunk-1"],
                },
              ],
              methods: [],
              examples: [
                {
                  title: "Train-station bystander scenario",
                  text: sourceText,
                  illustrates: ["bystander effect", "diffusion of responsibility"],
                },
              ],
              constraints: [],
              inferredSuggestions: [],
            },
            source_concept_ids: [],
            source_spans: [
              {
                chunk_index: 0,
                char_start: 0,
                char_end: sourceText.length,
                text: sourceText,
              },
            ],
            confidence: "high",
            conflict_detected: false,
            conflict_summary: null,
            conflict_resolution: null,
          },
        ],
        suggested_links: [],
      },
      existing_blocks_context: [
        {
          block_id: "block-bystander",
          knowledge_source_id: "ks-bystander",
          compiled_note_id: "compiled-bystander",
          title: "Bystander Effect",
          heading: null,
          body_markdown: existingBody,
          rank: 1,
          linked_block_ids: [],
        },
      ],
    });

    expect(judge.overall_verdict).toBe("pass");
  });

  test("fails non-conflicting targeted updates that only submit the new source delta", () => {
    const sourceText =
      "At a train station, a passenger sits down looking pale while nearby people wait for someone else to act. This illustrates the bystander effect.";
    const existingBody =
      "People are less likely to help someone in trouble when other people are around. This bystander effect is driven by diffusion of responsibility and pluralistic ignorance.";
    const judge = judgeProposalHeuristically({
      source_text: sourceText,
      chunks: [
        {
          id: "chunk-1",
          chunk_index: 0,
          heading: "Train station",
          body_markdown: sourceText,
          token_estimate: 24,
        },
      ],
      proposal: {
        indexing_outcome: "update_existing_knowledge",
        outcome_reason: "The source adds a concrete example to an existing block.",
        reasoning_summary: "Only drafted the new example.",
        incomplete_reasoning: false,
        items: [
          {
            action: "upsert_knowledge",
            target_block_id: "block-bystander",
            title: "Bystander Effect",
            body_markdown: `Example: ${sourceText}`,
            structured_facets: {
              summary: "Train-station example.",
              concepts: [],
              claims: [
                {
                  text: "A train-station passenger looking pale while others wait for someone else to act illustrates the bystander effect.",
                  confidence: "high",
                  evidenceChunkIds: ["chunk-1"],
                },
              ],
              methods: [],
              examples: [],
              constraints: [],
              inferredSuggestions: [],
            },
            source_concept_ids: [],
            source_spans: [
              {
                chunk_index: 0,
                char_start: 0,
                char_end: sourceText.length,
                text: sourceText,
              },
            ],
            confidence: "high",
            conflict_detected: false,
            conflict_summary: null,
            conflict_resolution: null,
          },
        ],
        suggested_links: [],
      },
      existing_blocks_context: [
        {
          block_id: "block-bystander",
          knowledge_source_id: "ks-bystander",
          compiled_note_id: "compiled-bystander",
          title: "Bystander Effect",
          heading: null,
          body_markdown: existingBody,
          rank: 1,
          linked_block_ids: [],
        },
      ],
    });

    expect(judge.overall_verdict).toBe("fail");
    expect(judge.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("complete merged knowledge body"),
        }),
      ]),
    );
  });
});
