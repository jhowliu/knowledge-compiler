import { z } from "zod";

export const toolContractVersion = "1.2.0";

export class AgentContractError extends Error {
  constructor(
    readonly code: "tool_schema_violation" | "tool_output_invalid" | "source_span_invalid",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AgentContractError";
  }
}

export const sourceSpanSchema = z.object({
  chunk_index: z.number().int().nonnegative(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().positive(),
  text: z.string().min(1),
});

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const conflictResolutionSchema = z.enum(["update", "keep_both", "needs_user_decision"]);
export const indexingOutcomeSchema = z.enum([
  "keep_searchable",
  "create_knowledge",
  "update_existing_knowledge",
]);

export const knowledgeStructuredDataSchema = z.object({
  summary: z.string(),
  concepts: z.array(
    z.object({
      name: z.string().min(1),
      type: z.enum(["topic", "method", "entity", "framework", "term"]),
      specificity: z.enum(["generic", "specific"]),
      confidence: confidenceSchema,
    }),
  ),
  claims: z.array(
    z.object({
      text: z.string().min(1),
      confidence: confidenceSchema,
      evidenceChunkIds: z.array(z.string()),
    }),
  ),
  methods: z.array(
    z.object({
      name: z.string().min(1),
      purpose: z.string(),
      steps: z.array(z.string()),
      conditions: z.array(z.string()),
    }),
  ),
  examples: z.array(
    z.object({
      title: z.string().nullable(),
      text: z.string().min(1),
      illustrates: z.array(z.string()),
    }),
  ),
  constraints: z.array(
    z.object({
      text: z.string().min(1),
      appliesTo: z.string().nullable(),
    }),
  ),
  inferredSuggestions: z.array(
    z.object({
      text: z.string().min(1),
      reason: z.string(),
      confidence: confidenceSchema,
    }),
  ),
});

export const proposalItemSchema = z
  .object({
    action: z.enum(["upsert_knowledge", "create_knowledge", "keep_source_searchable"]),
    target_block_id: z.string().nullable(),
    title: z.string().min(1),
    body_markdown: z.string().min(1),
    structured_facets: knowledgeStructuredDataSchema.optional(),
    source_concept_ids: z.array(z.string()),
    source_spans: z.array(sourceSpanSchema).min(1),
    confidence: confidenceSchema,
    conflict_detected: z.boolean(),
    conflict_summary: z.string().nullable(),
    conflict_resolution: conflictResolutionSchema.nullable(),
  })
  .superRefine((item, context) => {
    if (item.conflict_detected && !item.conflict_summary) {
      context.addIssue({
        code: "custom",
        path: ["conflict_summary"],
        message: "conflict_summary is required when conflict_detected is true",
      });
    }
    if (item.conflict_detected && !item.conflict_resolution) {
      context.addIssue({
        code: "custom",
        path: ["conflict_resolution"],
        message: "conflict_resolution is required when conflict_detected is true",
      });
    }
  });

export const suggestedLinkSchema = z.object({
  source_block_id: z.string().nullable(),
  target_block_id: z.string(),
  relation_type: z.string().min(1),
  confidence: confidenceSchema,
  rationale: z.string().nullable(),
});

export const getSourceInputSchema = z.object({
  source_id: z.string().min(1),
});

export const sourceChunkSchema = z.object({
  id: z.string(),
  chunk_index: z.number().int().nonnegative(),
  heading: z.string().nullable(),
  body_markdown: z.string(),
  token_estimate: z.number().int().nonnegative(),
});

export const getSourceOutputSchema = z.object({
  source: z.object({
    id: z.string(),
    user_id: z.string().nullable(),
    title: z.string().nullable(),
    source_role: z.enum(["personal_note", "reference"]),
    source_type: z.string(),
    subtype: z.string().nullable(),
    topic_ids: z.array(z.string()),
    body_markdown: z.string(),
  }),
  chunks: z.array(sourceChunkSchema),
});

export const searchBlocksInputSchema = z.object({
  query: z.string().min(1),
  topic_ids: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(20).optional(),
  include_archived: z.boolean().optional(),
});

export const blockSummarySchema = z.object({
  block_id: z.string(),
  knowledge_source_id: z.string(),
  compiled_note_id: z.string().nullable(),
  title: z.string(),
  heading: z.string().nullable(),
  body_markdown_preview: z.string(),
  rank: z.number(),
  linked_block_ids: z.array(z.string()),
});

export const searchBlocksOutputSchema = z.object({
  results: z.array(blockSummarySchema),
});

export const getBlockInputSchema = z.object({
  block_id: z.string().min(1),
});

export const evidenceReferenceSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  source_id: z.string(),
  chunk_index: z.number().int().nullable(),
  chunk_body_markdown: z.string().nullable(),
});

export const blockLinkSchema = z.object({
  id: z.string(),
  source_block_id: z.string().nullable(),
  target_block_id: z.string().nullable(),
  relation_type: z.string(),
  confidence: confidenceSchema,
});

export const getBlockOutputSchema = z.object({
  block: z.object({
    id: z.string(),
    knowledge_source_id: z.string(),
    knowledge_version_id: z.string(),
    compiled_note_id: z.string().nullable(),
    title: z.string(),
    heading: z.string().nullable(),
    body_markdown: z.string(),
    status: z.string(),
  }),
  evidence: z.array(evidenceReferenceSchema),
  links: z.array(blockLinkSchema),
});

export const lookupConceptsInputSchema = z.object({
  concepts: z.array(z.string().min(1)).min(1),
  fuzzy: z.boolean().optional(),
});

export const conceptMatchSchema = z.object({
  input: z.string(),
  concept_id: z.string().nullable(),
  canonical_label: z.string().nullable(),
  match_type: z.enum(["exact", "fuzzy", "none"]),
  linked_block_ids: z.array(z.string()),
});

export const lookupConceptsOutputSchema = z.object({
  matches: z.array(conceptMatchSchema),
});

export const getBlockHistoryInputSchema = z.object({
  block_id: z.string().min(1),
  limit: z.number().int().positive().max(20).optional(),
});

export const blockHistoryVersionSchema = z.object({
  knowledge_version_id: z.string(),
  version_number: z.number().int().positive(),
  title: z.string(),
  body_markdown: z.string(),
  created_at: z.string(),
});

export const getBlockHistoryOutputSchema = z.object({
  versions: z.array(blockHistoryVersionSchema),
});

export const draftProposalInputSchema = z.object({
  indexing_outcome: indexingOutcomeSchema,
  outcome_reason: z.string().min(1),
  reasoning_summary: z.string().min(1),
  incomplete_reasoning: z.boolean(),
  items: z.array(proposalItemSchema).min(1),
  suggested_links: z.array(suggestedLinkSchema),
});

export const draftProposalOutputSchema = z.object({
  proposal_id: z.string(),
  item_count: z.number().int().nonnegative(),
  link_count: z.number().int().nonnegative(),
  saved_at: z.string(),
});

export const evalWarningSchema = z.object({
  type: z.enum(["missing_concept", "ungrounded", "missed_conflict", "too_coarse", "low_coverage"]),
  message: z.string(),
  severity: z.enum(["high", "medium"]),
  affected_item_index: z.number().int().nonnegative().nullable(),
});

export const judgeInputSchema = z.object({
  source_text: z.string(),
  chunks: z.array(sourceChunkSchema),
  proposal: draftProposalInputSchema,
  existing_blocks_context: z.array(blockSummarySchema),
});

export const judgeOutputSchema = z.object({
  coverage: z.object({
    expected_concepts: z.array(z.object({ label: z.string(), reason: z.string() })),
    missing_from_proposal: z.array(z.string()),
    // null = coverage was not measured (the deterministic lint does not estimate
    // under-extraction; that requires an LLM judge).
    score: z.number().min(0).max(1).nullable(),
  }),
  grounding: z.array(
    z.object({
      item_index: z.number().int().nonnegative(),
      verdict: z.enum(["grounded", "weak", "ungrounded"]),
      reason: z.string().nullable(),
    }),
  ),
  conflict_review: z.array(
    z.object({
      item_index: z.number().int().nonnegative(),
      acknowledged: z.boolean(),
      missed_conflict: z.string().nullable(),
    }),
  ),
  overall_verdict: z.enum(["pass", "warn", "fail"]),
  warnings: z.array(evalWarningSchema),
  summary: z.string(),
});

export type SourceSpan = z.infer<typeof sourceSpanSchema>;
export type ProposalItem = z.infer<typeof proposalItemSchema>;
export type IndexingOutcome = z.infer<typeof indexingOutcomeSchema>;
export type SuggestedLink = z.infer<typeof suggestedLinkSchema>;
export type GetSourceInput = z.infer<typeof getSourceInputSchema>;
export type GetSourceOutput = z.infer<typeof getSourceOutputSchema>;
export type SearchBlocksInput = z.infer<typeof searchBlocksInputSchema>;
export type SearchBlocksOutput = z.infer<typeof searchBlocksOutputSchema>;
export type GetBlockInput = z.infer<typeof getBlockInputSchema>;
export type GetBlockOutput = z.infer<typeof getBlockOutputSchema>;
export type LookupConceptsInput = z.infer<typeof lookupConceptsInputSchema>;
export type LookupConceptsOutput = z.infer<typeof lookupConceptsOutputSchema>;
export type GetBlockHistoryInput = z.infer<typeof getBlockHistoryInputSchema>;
export type GetBlockHistoryOutput = z.infer<typeof getBlockHistoryOutputSchema>;
export type DraftProposalInput = z.infer<typeof draftProposalInputSchema>;
export type DraftProposalOutput = z.infer<typeof draftProposalOutputSchema>;
export type EvalWarning = z.infer<typeof evalWarningSchema>;
export type JudgeInput = z.infer<typeof judgeInputSchema>;
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

export function validateToolInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AgentContractError("tool_schema_violation", "Tool input failed schema validation", result.error.issues);
  }
  return result.data;
}

export function validateToolOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AgentContractError("tool_output_invalid", "Tool output failed schema validation", result.error.issues);
  }
  return result.data;
}

export function verifySourceSpans(
  chunks: Array<{ chunk_index: number; body_markdown: string }>,
  spans: SourceSpan[],
) {
  const invalidSpans: SourceSpan[] = [];
  for (const span of spans) {
    const chunk = chunks.find((item) => item.chunk_index === span.chunk_index);
    const slice = chunk?.body_markdown.slice(span.char_start, span.char_end);
    if (!chunk || slice !== span.text || !chunk.body_markdown.includes(span.text)) {
      invalidSpans.push(span);
    }
  }
  return {
    ok: invalidSpans.length === 0,
    invalidSpans,
  };
}
