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

export type DraftProposalContext = {
  agentRunId: string;
  rawNoteId: string;
  sourceId: string;
  userId?: string | null;
  chunks: Array<{ chunk_index: number; body_markdown: string; id: string; heading: string | null; token_estimate: number }>;
  sourceText: string;
  existingBlocksContext?: Array<{
    block_id: string;
    knowledge_source_id: string;
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
    const results = await this.knowledgeRepository.searchKnowledgeBlocks({
      query: parsedInput.query,
      includeArchived: parsedInput.include_archived,
      limit: parsedInput.limit ?? 8,
    });

    return validateToolOutput(searchBlocksOutputSchema, {
      results: results.map((result) => ({
        block_id: result.blockId,
        knowledge_source_id: result.knowledgeSourceId,
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

    const draft = toDraftUpdateProposal(parsedInput, judgeOutput, invalidItemIndexes);
    const proposal = await this.proposalRepository.create({
      userId: context.userId,
      rawNoteId: context.rawNoteId,
      draft,
    });

    return validateToolOutput(draftProposalOutputSchema, {
      proposal_id: proposal.id,
      item_count: parsedInput.items.length,
      link_count: parsedInput.suggested_links.length,
      saved_at: proposal.createdAt.toISOString(),
    });
  }
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
): DraftUpdateProposal {
  return {
    detectedDomain: "general",
    detectedKnowledgeType: "knowledge_note",
    impactLevel: judgeOutput.overall_verdict === "fail" ? 3 : 2,
    confidence: judgeOutput.overall_verdict === "pass" ? "high" : "medium",
    rationale: input.reasoning_summary,
    items: [
      ...input.items.map((item, index) => ({
        actionType: item.action === "create_knowledge" ? "upsert_knowledge" : item.action,
        targetType: "knowledge_source",
        payload: {
          knowledgeType: "knowledge_note",
          title: item.title,
          bodyMarkdown: item.body_markdown,
          structuredData: {
            sourceConceptIds: item.source_concept_ids,
            sourceSpans: item.source_spans,
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
      })),
      ...input.suggested_links.map((link) => ({
        actionType: "create_link",
        targetType: "note_link",
        payload: {
          sourceBlockId: link.source_block_id,
          targetBlockId: link.target_block_id,
          relationType: link.relation_type,
          confidence: link.confidence,
        },
        rationale: link.rationale ?? "Agent suggested a relationship link.",
        evalVerdict: judgeOutput.overall_verdict,
        incompleteReasoning: input.incomplete_reasoning,
      })),
    ],
  };
}
