import type {
  DraftProposalInput,
  GetBlockHistoryInput,
  GetBlockInput,
  GetSourceInput,
  LookupConceptsInput,
  SearchBlocksInput,
} from "@knowledge-compiler/agent-contracts";
import {
  draftProposalInputSchema,
  draftProposalOutputSchema,
  getBlockHistoryInputSchema,
  getBlockHistoryOutputSchema,
  getBlockInputSchema,
  getBlockOutputSchema,
  getSourceInputSchema,
  getSourceOutputSchema,
  lookupConceptsInputSchema,
  lookupConceptsOutputSchema,
  searchBlocksInputSchema,
  searchBlocksOutputSchema,
  validateToolInput,
  validateToolOutput,
  verifySourceSpans,
} from "@knowledge-compiler/agent-contracts";
import type { DraftUpdateProposal } from "../domain/compiler.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";
import type { ExtractionEvalRepository } from "../repositories/extractionEval.repository.js";
import type { AgentToolReadRepository } from "../repositories/agentTool.repository.js";
import { EvalJudgeService, itemEvalVerdict } from "./evalJudge.service.js";
import {
  normalizeKnowledgeStructuredData,
  renderKnowledgeFacetsMarkdown,
} from "./knowledgeFacets.service.js";
import { NoopQueryConceptResolver, type QueryConceptResolver } from "./queryConcept.service.js";

export type DraftProposalContext = {
  agentRunId: string;
  rawNoteId: string | null;
  sourceId: string;
  userId?: string | null;
  chunks: Array<{ chunk_index: number; body_markdown: string; id: string; heading: string | null; token_estimate: number }>;
  sourceText: string;
  existingBlocksContext?: Array<{
    block_id: string;
    knowledge_source_id: string;
    compiled_note_id: string | null;
    title: string;
    heading: string | null;
    body_markdown_preview: string;
    rank: number;
    linked_block_ids: string[];
  }>;
};

export class AgentToolService {
  constructor(
    private readonly rawSourceRepository: RawSourceRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly proposalRepository: ProposalRepository,
    private readonly extractionEvalRepository: ExtractionEvalRepository,
    private readonly readRepository: AgentToolReadRepository,
    private readonly evalJudgeService = new EvalJudgeService(),
    private readonly queryConceptResolver: QueryConceptResolver = new NoopQueryConceptResolver(),
  ) {}

  async getSource(input: GetSourceInput) {
    const parsedInput = validateToolInput(getSourceInputSchema, input);
    const source = await this.rawSourceRepository.getById(parsedInput.source_id);
    if (!source) {
      throw new Error("Raw source not found");
    }

    return validateToolOutput(getSourceOutputSchema, {
      source: {
        id: source.id,
        user_id: source.userId,
        title: source.title,
        source_role: source.sourceRole,
        source_type: source.sourceType,
        subtype: source.subtype,
        topic_ids: source.topicIds,
        body_markdown: source.bodyMarkdown,
      },
      chunks: source.chunks.map((chunk) => ({
        id: chunk.id,
        chunk_index: chunk.chunkIndex,
        heading: chunk.heading,
        body_markdown: chunk.bodyMarkdown,
        token_estimate: chunk.tokenEstimate,
      })),
    });
  }

  async searchBlocks(input: SearchBlocksInput) {
    const parsedInput = validateToolInput(searchBlocksInputSchema, input);
    const resolvedConcepts = await this.queryConceptResolver.resolve({ query: parsedInput.query });
    const results = await this.knowledgeRepository.searchKnowledgeBlocks({
      query: parsedInput.query,
      includeArchived: parsedInput.include_archived,
      limit: parsedInput.limit ?? 8,
      resolvedConceptIds: resolvedConcepts.map((concept) => concept.conceptId),
    });

    return validateToolOutput(searchBlocksOutputSchema, {
      results: results.map((result) => ({
        block_id: result.blockId,
        knowledge_source_id: result.knowledgeSourceId,
        compiled_note_id: result.compiledNoteId,
        title: result.title,
        heading: result.heading,
        body_markdown_preview: result.bodyMarkdown.slice(0, 320),
        rank: result.rank,
        linked_block_ids: [],
      })),
    });
  }

  async getBlock(input: GetBlockInput) {
    const parsedInput = validateToolInput(getBlockInputSchema, input);
    const output = await this.readRepository.getBlock(parsedInput.block_id);
    if (!output) {
      throw new Error("Knowledge block not found");
    }
    return validateToolOutput(getBlockOutputSchema, output);
  }

  async lookupConcepts(input: LookupConceptsInput) {
    const parsedInput = validateToolInput(lookupConceptsInputSchema, input);
    return validateToolOutput(
      lookupConceptsOutputSchema,
      await this.readRepository.lookupConcepts(parsedInput.concepts, parsedInput.fuzzy ?? false),
    );
  }

  async getBlockHistory(input: GetBlockHistoryInput) {
    const parsedInput = validateToolInput(getBlockHistoryInputSchema, input);
    return validateToolOutput(
      getBlockHistoryOutputSchema,
      await this.readRepository.getBlockHistory(parsedInput.block_id, parsedInput.limit ?? 5),
    );
  }

  async draftProposal(context: DraftProposalContext, input: DraftProposalInput) {
    const parsedInput = validateToolInput(draftProposalInputSchema, input);
    const invalidItemIndexes = new Set<number>();
    parsedInput.items.forEach((item, index) => {
      const verification = verifySourceSpans(context.chunks, item.source_spans);
      if (!verification.ok) {
        invalidItemIndexes.add(index);
      }
    });

    const judgeInput = {
      source_text: context.sourceText,
      chunks: context.chunks.map((chunk) => ({
        id: chunk.id,
        chunk_index: chunk.chunk_index,
        heading: chunk.heading,
        body_markdown: chunk.body_markdown,
        token_estimate: chunk.token_estimate,
      })),
      proposal: parsedInput,
      existing_blocks_context: context.existingBlocksContext ?? [],
    };
    const judgeOutput = await this.evalJudgeService.judge(judgeInput, invalidItemIndexes);
    await this.extractionEvalRepository.create({
      agentRunId: context.agentRunId,
      sourceId: context.sourceId,
      verdict: judgeOutput.overall_verdict,
      coverageScore: judgeOutput.coverage.score,
      groundingScore: groundingScore(judgeOutput.grounding),
      warnings: judgeOutput.warnings,
      rawJudgeOutput: judgeOutput,
    });

    const draft = toDraftUpdateProposal(
      parsedInput,
      judgeOutput,
      invalidItemIndexes,
      context.existingBlocksContext ?? [],
      {
        rawSourceId: context.sourceId,
      },
    );
    const proposal = await this.proposalRepository.create({
      userId: context.userId,
      rawSourceId: context.sourceId,
      draft,
    });

    return validateToolOutput(draftProposalOutputSchema, {
      proposal_id: proposal.id,
      item_count: parsedInput.items.length,
      link_count: judgedLinks(parsedInput).length,
      saved_at: proposal.createdAt.toISOString(),
    });
  }
}

/** Links the agent judged strong enough to create (#98): medium/high only. */
function judgedLinks(input: DraftProposalInput) {
  return input.suggested_links.filter((link) => link.confidence !== "low");
}

function groundingScore(grounding: Array<{ verdict: "grounded" | "weak" | "ungrounded" }>) {
  if (!grounding.length) return null;
  const total = grounding.reduce((score, item) => {
    if (item.verdict === "grounded") return score + 1;
    if (item.verdict === "weak") return score + 0.5;
    return score;
  }, 0);
  return Number((total / grounding.length).toFixed(3));
}

function toDraftUpdateProposal(
  input: DraftProposalInput,
  judgeOutput: Awaited<ReturnType<EvalJudgeService["judge"]>>,
  invalidItemIndexes: Set<number>,
  existingBlocksContext: NonNullable<DraftProposalContext["existingBlocksContext"]>,
  sourceReference: { rawSourceId: string },
): DraftUpdateProposal {
  return {
    detectedDomain: "general",
    detectedKnowledgeType: input.indexing_outcome === "keep_searchable" ? "source_only" : "knowledge_note",
    impactLevel: judgeOutput.overall_verdict === "fail" ? 3 : 2,
    confidence: judgeOutput.overall_verdict === "pass" ? "high" : "medium",
    rationale: `Recommended: ${input.indexing_outcome.replaceAll("_", " ")}. ${input.outcome_reason} ${input.reasoning_summary}`,
    items: [
      ...input.items.map((item, index) => {
        const targetBlock = item.target_block_id
          ? existingBlocksContext.find((block) => block.block_id === item.target_block_id) ?? null
          : null;
        // Display body is the model-authored readable note (#119); facets stay
        // canonical in structuredData below. Fall back to the facet render only
        // when the model wrote no prose.
        const bodyMarkdown = item.body_markdown?.trim()
          ? item.body_markdown
          : renderKnowledgeFacetsMarkdown(item.structured_facets ?? {}, "");
        const structuredData = item.structured_facets
          ? normalizeKnowledgeStructuredData(item.structured_facets)
          : {};

        return {
          actionType: item.action === "create_knowledge" ? "upsert_knowledge" : item.action,
          targetType: item.action === "keep_source_searchable" ? "raw_source" : "knowledge_source",
          payload: {
            outcome: input.indexing_outcome,
            outcomeReason: input.outcome_reason,
            knowledgeType: "knowledge_note",
            title: item.title,
            bodyMarkdown,
            rawSourceId: item.action === "keep_source_searchable" ? sourceReference.rawSourceId : null,
            targetKnowledgeSourceId: targetBlock?.knowledge_source_id ?? null,
            targetCompiledNoteId: targetBlock?.compiled_note_id ?? null,
            targetBlockId: item.target_block_id,
            structuredData: {
              ...structuredData,
              sourceConceptIds: item.source_concept_ids,
              sourceSpans: item.source_spans,
              targetBlockId: item.target_block_id,
            },
            knowledgeProposal: {
              domain: "general",
              knowledgeType: "knowledge_note",
              title: item.title,
              bodyMarkdown,
              structuredData,
              targetKnowledgeSourceId: targetBlock?.knowledge_source_id ?? null,
              targetCompiledNoteId: targetBlock?.compiled_note_id ?? null,
              targetBlockId: item.target_block_id,
            },
          },
          rationale: input.reasoning_summary,
          sourceSpans: item.source_spans,
          conflictDetected: item.conflict_detected,
          conflictSummary: item.conflict_summary,
          conflictResolution: item.conflict_resolution,
          evalVerdict: itemEvalVerdict(input, judgeOutput, index, invalidItemIndexes),
          incompleteReasoning: input.incomplete_reasoning,
        };
      }),
      // Only medium/high-confidence judged links become pending links (#98);
      // low-confidence judgments are dropped rather than creating noisy links.
      ...judgedLinks(input).map((link) => ({
        actionType: "create_link",
        targetType: "note_link",
        payload: {
          sourceBlockId: link.source_block_id,
          targetBlockId: link.target_block_id,
          relationType: link.relation_type,
          confidence: link.confidence,
          sourceEvidence: link.source_evidence,
          targetEvidence: link.target_evidence,
        },
        rationale: link.rationale ?? "Agent suggested a relationship link.",
        evalVerdict: judgeOutput.overall_verdict,
        incompleteReasoning: input.incomplete_reasoning,
      })),
    ],
  };
}
