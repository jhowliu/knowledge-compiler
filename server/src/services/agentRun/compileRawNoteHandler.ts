import type { AgentRun } from "../../domain/knowledge.js";
import type { AgentRunRepository } from "../../repositories/agentRun.repository.js";
import type { KnowledgeRepository } from "../../repositories/knowledge.repository.js";
import type { ProposalRepository } from "../../repositories/proposal.repository.js";
import type { RawSourceRepository } from "../../repositories/rawSource.repository.js";
import type { RawSourceWithChunks } from "../../domain/rawSource.js";
import { agentRunEvents } from "../../domain/agentRunEvents.js";
import type {
  DraftProposalInput,
  GetSourceOutput,
  LookupConceptsOutput,
  SearchBlocksOutput,
} from "@knowledge-compiler/agent-contracts";
import {
  WikiIndexerService,
  type WikiIndexer,
  type WikiIndexingSource,
} from "../wikiIndexer.service.js";
import { compileRunMetadata } from "../../agents/versions.js";
import type { ExtractionEvalRepository } from "../../repositories/extractionEval.repository.js";
import { NoopExtractionEvalRepository } from "../../repositories/extractionEval.repository.js";
import type { AgentToolReadRepository } from "../../repositories/agentTool.repository.js";
import { NoopAgentToolReadRepository } from "../../repositories/agentTool.repository.js";
import { AgentToolService } from "../agentTool.service.js";
import { normalizeKnowledgeStructuredData } from "../knowledgeFacets.service.js";
import {
  runAgentLoop,
  type AgentRunner,
  type LoopEvent,
  type LoopTool,
  type LoopView,
} from "../agentLoop.js";
import type { AgentRunHandler } from "./agentRunHandler.js";
import type { CompileAgentRunnerContext, CompileAgentRunnerFactory } from "./compileRunner.types.js";

type GeneralCompileExtraction = Awaited<ReturnType<WikiIndexer["extract"]>>["extraction"];

type CompileLoopState = {
  sourceToolOutput: GetSourceOutput | null;
  extraction: GeneralCompileExtraction;
  outcomeClassified: boolean;
  targetBlockId: string | null;
  conflict: {
    detected: boolean;
    summary: string | null;
    resolution: "update" | "keep_both" | "needs_user_decision" | null;
  };
  conceptLookup: LookupConceptsOutput | null;
  candidateBlocks: SearchBlocksOutput["results"];
  fetchedBlocks: Map<string, Awaited<ReturnType<AgentToolService["getBlock"]>>>;
  proposalOutput: Awaited<ReturnType<AgentToolService["draftProposal"]>> | null;
  conceptIds: string[];
  conceptsIndexed: boolean;
};

export class CompileRawNoteHandler implements AgentRunHandler {
  readonly runType = "compile_raw_note";

  constructor(
    private readonly agentRunRepository: AgentRunRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly proposalRepository: ProposalRepository,
    private readonly wikiIndexerService: WikiIndexer = new WikiIndexerService(),
    private readonly rawSourceRepository?: RawSourceRepository | null,
    private readonly extractionEvalRepository: ExtractionEvalRepository = new NoopExtractionEvalRepository(),
    private readonly agentToolReadRepository: AgentToolReadRepository = new NoopAgentToolReadRepository(),
    private readonly compileAgentRunnerFactory: CompileAgentRunnerFactory = createScriptedCompileAgentRunner,
  ) {}

  validateInput(input: Record<string, unknown>) {
    if (typeof input.rawSourceId !== "string") {
      throw new Error("compile_raw_note requires rawSourceId");
    }
  }

  async run(agentRun: AgentRun) {
    await this.agentRunRepository.updateMetadata(agentRun.id, compileRunMetadata());
    const input =
      agentRun.input && typeof agentRun.input === "object"
        ? (agentRun.input as Record<string, unknown>)
        : {};
    return this.compileRawNote(agentRun.id, {
      rawSourceId: typeof input.rawSourceId === "string" ? input.rawSourceId : null,
    });
  }

  private async compileRawNote(
    agentRunId: string,
    input: { rawSourceId: string | null },
  ) {
    if (!this.rawSourceRepository || !this.proposalRepository) {
      throw new Error("compile worker is not configured");
    }
    const proposalRepository = this.proposalRepository;

    const { rawSource, source } = await this.resolveIndexingSource(input);
    const agentToolService = this.createAgentToolService();

    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.source.rawNoteLoaded,
      payload: {
        rawSourceId: source.rawSourceId,
        sourceRole: source.sourceRole,
        sourceType: source.sourceType,
      },
    });
    if (rawSource) {
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.source.rawSourceLoaded,
        payload: {
          rawSourceId: rawSource.id,
          chunkCount: rawSource.chunks.length,
          sourceRole: rawSource.sourceRole,
          sourceType: rawSource.sourceType,
        },
      });
    }

    const { extraction: extractedResult, provider } = await this.wikiIndexerService.extract(source);
    // Provisional outcome from the LLM extraction. The authoritative outcome is
    // decided below, AFTER the knowledge base has been searched (see #103).
    const extractedConcepts = extractedResult.structuredData.concepts;
    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.indexing.detected,
      payload: {
        provider,
        outcome: extractedResult.outcome,
        outcomeReason: extractedResult.outcomeReason,
        knowledgeType: extractedResult.knowledgeType,
        concepts: extractedConcepts,
      },
    });

    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.indexing.drafted,
      payload: {
        provider,
        conceptCount: extractedConcepts.length,
        claimCount: extractedResult.structuredData.claims.length,
        methodCount: extractedResult.structuredData.methods.length,
        outcome: extractedResult.outcome,
      },
    });

    const relatedNotes = await this.knowledgeRepository.searchRelated({
      query: source.bodyMarkdown,
      conceptNames: extractedConcepts.map((concept) => concept.name),
      limit: 8,
    });
    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.indexing.relatedFound,
      payload: { relatedNotes },
    });
    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.linking.candidatesFound,
      payload: { candidateCount: relatedNotes.length },
    });

    if (!agentToolService) {
      for (const concept of extractedConcepts) {
        const savedConcept = await this.knowledgeRepository.upsertConcept({
          userId: source.userId,
          name: concept.name,
          conceptType: concept.type,
        });
        await this.knowledgeRepository.indexConcept({
          userId: source.userId,
          conceptId: savedConcept.id,
          targetType: "raw_source",
          targetId: rawSource.id,
          relationType: "mentions",
          confidence: concept.confidence,
          source: "openai_wiki_indexer",
        });
      }
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.indexing.outcomeClassified,
        payload: {
          outcome: extractedResult.outcome,
          reason: extractedResult.outcomeReason,
          targetBlockId: null,
        },
      });
      if (this.rawSourceRepository) {
        await this.rawSourceRepository.updateExtraction(rawSource.id, extractedResult);
      }
      const draft = this.wikiIndexerService.draftProposal(source, extractedResult, relatedNotes);
      const proposal = await proposalRepository.create({
        userId: source.userId,
        rawSourceId: source.rawSourceId,
        draft,
      });
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.proposal.created,
        payload: { proposalId: proposal.id },
      });

      return {
        rawNoteId: source.rawNoteId,
        rawSourceId: source.rawSourceId,
        sourceRole: source.sourceRole,
        chunkCount: source.chunks.length,
        proposalId: proposal.id,
        provider,
        indexingOutcome: extractedResult.outcome,
        detectedKnowledgeType: extractedResult.knowledgeType,
        conceptCount: extractedConcepts.length,
        relatedNoteCount: relatedNotes.length,
      };
    }

    const loopState: CompileLoopState = {
      sourceToolOutput: null,
      extraction: extractedResult,
      outcomeClassified: false,
      targetBlockId: null,
      conflict: { detected: false, summary: null, resolution: null },
      conceptLookup: null,
      candidateBlocks: [],
      fetchedBlocks: new Map(),
      proposalOutput: null,
      conceptIds: [],
      conceptsIndexed: false,
    };

    const indexConcepts = async () => {
      if (loopState.conceptsIndexed) return;
      for (const concept of loopState.extraction.structuredData.concepts) {
        const savedConcept = await this.knowledgeRepository.upsertConcept({
          userId: source.userId,
          name: concept.name,
          conceptType: concept.type,
        });
        loopState.conceptIds.push(savedConcept.id);
        await this.knowledgeRepository.indexConcept({
          userId: source.userId,
          conceptId: savedConcept.id,
          targetType: "raw_source",
          targetId: rawSource.id,
          relationType: "mentions",
          confidence: concept.confidence,
          source: "openai_wiki_indexer",
        });
      }
      loopState.conceptsIndexed = true;
    };

    const classifyOutcome = async (view: LoopView) => {
      refreshLoopObservations(loopState, view);
      if (!loopState.outcomeClassified) {
        if (loopState.extraction.outcome !== "keep_searchable" && this.wikiIndexerService.classifyOutcome) {
          const classification = await this.wikiIndexerService.classifyOutcome({
            source,
            extraction: loopState.extraction,
            candidateBlocks: loopState.candidateBlocks.map((result) => ({
              block_id: result.block_id,
              title: result.title,
              heading: result.heading,
              body_markdown_preview: result.body_markdown_preview,
            })),
            conceptMatches: (loopState.conceptLookup?.matches ?? [])
              .filter((match) => match.match_type !== "none")
              .map((match) => match.canonical_label ?? match.input),
          });
          loopState.extraction = {
            ...loopState.extraction,
            outcome: classification.outcome,
            outcomeReason: classification.outcomeReason,
            confidence: classification.confidence,
          };
          loopState.targetBlockId = classification.outcome === "update_existing_knowledge"
            ? classification.targetBlockId
            : null;
          loopState.conflict = {
            detected: classification.conflictDetected,
            summary: classification.conflictSummary,
            resolution: classification.conflictResolution,
          };
        } else if (loopState.extraction.outcome === "update_existing_knowledge") {
          // Fallback when the indexer cannot reclassify: use the top candidate.
          loopState.targetBlockId = loopState.candidateBlocks[0]?.block_id ?? null;
        }
        loopState.outcomeClassified = true;
        await this.agentRunRepository.addEvent({
          agentRunId,
          ...agentRunEvents.indexing.outcomeClassified,
          payload: {
            outcome: loopState.extraction.outcome,
            reason: loopState.extraction.outcomeReason,
            targetBlockId: loopState.targetBlockId,
          },
        });
      }
      return {
        targetBlockId: loopState.targetBlockId,
        conflictDetected: loopState.conflict.detected,
      };
    };

    const buildDraftInput = (
      view: LoopView,
      options: { incompleteReasoning?: boolean; reason?: string } = {},
    ): DraftProposalInput => {
      refreshLoopObservations(loopState, view);
      const draft = this.wikiIndexerService.draftProposal(source, loopState.extraction, relatedNotes);
      const proposalChunks = loopState.sourceToolOutput?.chunks ?? contractChunks(source);
      const sourceSpan = firstSourceSpan(proposalChunks);
      const incompleteReasoning = options.incompleteReasoning ?? false;
      const fallbackReason = options.reason ? `${loopState.extraction.outcomeReason} ${options.reason}` : loopState.extraction.outcomeReason;
      const items = draft.items
        .filter((item) => item.actionType === "upsert_knowledge" || item.actionType === "keep_source_searchable")
        .map((item) => {
          const payload = item.payload as Record<string, unknown>;
          const keepOnly = item.actionType === "keep_source_searchable" || incompleteReasoning;
          return {
            action: keepOnly ? ("keep_source_searchable" as const) : ("upsert_knowledge" as const),
            target_block_id: keepOnly ? null : loopState.targetBlockId,
            title: typeof payload.title === "string" ? payload.title : source.title ?? "Untitled knowledge",
            body_markdown: typeof payload.bodyMarkdown === "string" ? payload.bodyMarkdown : source.bodyMarkdown,
            structured_facets: normalizeKnowledgeStructuredData(
              payload.structuredData ?? loopState.extraction.structuredData,
            ),
            source_concept_ids: [...new Set([
              ...loopState.conceptIds,
              ...(loopState.conceptLookup?.matches ?? [])
                .map((match) => match.concept_id)
                .filter((id): id is string => Boolean(id)),
            ])],
            source_spans: sourceSpan ? [sourceSpan] : [],
            confidence: loopState.extraction.confidence,
            conflict_detected: keepOnly ? false : loopState.conflict.detected,
            conflict_summary: keepOnly || !loopState.conflict.detected ? null : loopState.conflict.summary,
            conflict_resolution: keepOnly || !loopState.conflict.detected ? null : loopState.conflict.resolution,
          };
        });

      return {
        indexing_outcome: incompleteReasoning ? "keep_searchable" : loopState.extraction.outcome,
        outcome_reason: incompleteReasoning ? fallbackReason : loopState.extraction.outcomeReason,
        reasoning_summary: draft.rationale,
        incomplete_reasoning: incompleteReasoning,
        items,
        suggested_links: [],
      };
    };

    const runDraftProposal = async (input: DraftProposalInput, view: LoopView) => {
      refreshLoopObservations(loopState, view);
      await indexConcepts();
      loopState.extraction = {
        ...loopState.extraction,
        outcome: input.indexing_outcome,
        outcomeReason: input.outcome_reason,
      };
      if (this.rawSourceRepository) {
        await this.rawSourceRepository.updateExtraction(rawSource.id, loopState.extraction);
      }
      const proposalOutput = await agentToolService.draftProposal(
        {
          agentRunId,
          rawNoteId: source.rawNoteId,
          sourceId: source.rawSourceId ?? source.id,
          userId: source.userId,
          sourceText: source.bodyMarkdown,
          chunks: loopState.sourceToolOutput?.chunks ?? contractChunks(source),
          existingBlocksContext: loopState.candidateBlocks,
        },
        input,
      );
      loopState.proposalOutput = proposalOutput;
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.eval.completed,
        payload: { proposalId: proposalOutput.proposal_id },
      });
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.proposal.created,
        payload: { proposalId: proposalOutput.proposal_id },
      });
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.linking.judged,
        payload: {
          candidateCount: loopState.candidateBlocks.length,
          suggestedCount: input.suggested_links.length,
          // medium/high-confidence links that became pending create_link items
          linkedCount: proposalOutput.link_count,
        },
      });
      return proposalOutput;
    };

    const tools = this.createCompileLoopTools({
      agentRunId,
      source,
      loopState,
      agentToolService,
      runDraftProposal,
      buildDraftInput,
      classifyOutcome,
    });
    const runner = this.compileAgentRunnerFactory({
      source,
      extraction: extractedResult,
      extractedConceptNames: extractedConcepts.map((concept) => concept.name),
      classifyOutcome,
      buildDraftInput,
    });
    const loopOutcome = await runAgentLoop({
      runner,
      tools,
      maxRounds: 8,
      maxCallsPerTool: 3,
      onEvent: (event) => this.recordLoopEvent(agentRunId, event),
    });

    if (!loopState.proposalOutput) {
      const incompleteInput = buildDraftInput(
        { round: loopOutcome.rounds + 1, availableTools: [], transcript: loopOutcome.transcript },
        {
          incompleteReasoning: true,
          reason: `Agent loop exited before a complete proposal (${loopOutcome.exitReason}).`,
        },
      );
      await runDraftProposal(incompleteInput, {
        round: loopOutcome.rounds + 1,
        availableTools: [],
        transcript: loopOutcome.transcript,
      });
    }

    const draftProposalOutput = loopState.proposalOutput!;

    return {
      rawNoteId: source.rawNoteId,
      rawSourceId: source.rawSourceId,
      sourceRole: source.sourceRole,
      chunkCount: source.chunks.length,
      proposalId: draftProposalOutput.proposal_id,
      provider,
      indexingOutcome: loopState.extraction.outcome,
      detectedKnowledgeType: loopState.extraction.knowledgeType,
      conceptCount: loopState.extraction.structuredData.concepts.length,
      relatedNoteCount: relatedNotes.length,
    };
  }

  private createAgentToolService() {
    if (!this.rawSourceRepository || !this.proposalRepository) {
      return null;
    }
    return new AgentToolService(
      this.rawSourceRepository,
      this.knowledgeRepository,
      this.proposalRepository,
      this.extractionEvalRepository,
      this.agentToolReadRepository,
    );
  }

  private createCompileLoopTools(input: {
    agentRunId: string;
    source: WikiIndexingSource;
    loopState: CompileLoopState;
    agentToolService: AgentToolService;
    runDraftProposal: (
      input: DraftProposalInput,
      view: LoopView,
    ) => Promise<Awaited<ReturnType<AgentToolService["draftProposal"]>>>;
    buildDraftInput: (
      view: LoopView,
      options?: { incompleteReasoning?: boolean; reason?: string },
    ) => DraftProposalInput;
    classifyOutcome: (view: LoopView) => Promise<{ targetBlockId: string | null; conflictDetected: boolean }>;
  }): LoopTool[] {
    const { source, loopState, agentToolService, runDraftProposal, buildDraftInput, classifyOutcome } = input;
    const requiresSourceTool = Boolean(source.rawSourceId);
    const hasPrerequisiteSource = (view: LoopView) =>
      !requiresSourceTool || hasSuccessfulTool(view, "get_source");
    const hasSearch = (view: LoopView) => hasSuccessfulTool(view, "search_blocks");

    return [
      {
        name: "get_source",
        canRun: (view) => Boolean(source.rawSourceId) && !hasSuccessfulTool(view, "get_source"),
        run: async (toolInput) => {
          const output = await agentToolService.getSource(toolInput as { source_id: string });
          loopState.sourceToolOutput = output;
          return output;
        },
      },
      {
        name: "lookup_concepts",
        canRun: (view) => hasPrerequisiteSource(view) && !hasSuccessfulTool(view, "lookup_concepts"),
        run: async (toolInput) => {
          const output = await agentToolService.lookupConcepts(toolInput as { concepts: string[]; fuzzy?: boolean });
          loopState.conceptLookup = output;
          return output;
        },
      },
      {
        name: "search_blocks",
        canRun: (view) => hasPrerequisiteSource(view),
        run: async (toolInput) => {
          const output = await agentToolService.searchBlocks(toolInput as { query: string; limit?: number });
          mergeCandidateBlocks(loopState, output.results);
          return output;
        },
      },
      {
        name: "get_block",
        canRun: (view) => hasPrerequisiteSource(view) && hasSearch(view),
        run: async (toolInput) => {
          const blockId = blockIdFromInput(toolInput);
          if (!allowedBlockIdsFromState(loopState).has(blockId)) {
            throw new Error(`Block id was not surfaced by prior tool results: ${blockId}`);
          }
          const output = await agentToolService.getBlock({ block_id: blockId });
          loopState.fetchedBlocks.set(blockId, output);
          mergeCandidateBlocks(loopState, [blockSummaryFromBlock(output)]);
          return output;
        },
      },
      {
        name: "get_block_history",
        canRun: (view) => hasPrerequisiteSource(view) && hasSearch(view),
        run: async (toolInput) => {
          const blockId = blockIdFromInput(toolInput);
          if (!allowedBlockIdsFromState(loopState).has(blockId)) {
            throw new Error(`Block id was not surfaced by prior tool results: ${blockId}`);
          }
          return agentToolService.getBlockHistory(toolInput as { block_id: string; limit?: number });
        },
      },
      {
        name: "draft_proposal",
        terminal: true,
        canRun: (view) => hasPrerequisiteSource(view) && hasSearch(view),
        run: async (toolInput, view) => {
          const draftInput = isDraftProposalInput(toolInput)
            ? toolInput
            : buildDraftInput(view);
          if (!loopState.outcomeClassified) {
            applyDraftOutcome(loopState, draftInput);
          }
          await this.recordOutcomeClassified(input.agentRunId, loopState);
          return runDraftProposal(draftInput, view);
        },
      },
      {
        name: "finish_without_proposal",
        terminal: true,
        canRun: (view) => hasPrerequisiteSource(view) && hasSearch(view),
        run: async (_toolInput, view) => {
          await classifyOutcome(view);
          const draftInput = buildDraftInput(view, {
            incompleteReasoning: true,
            reason: "The agent stopped before drafting a complete proposal.",
          });
          return runDraftProposal(draftInput, view);
        },
      },
    ];
  }

  private async recordOutcomeClassified(
    agentRunId: string,
    loopState: CompileLoopState,
  ) {
    if (loopState.outcomeClassified) return;
    loopState.outcomeClassified = true;
    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.indexing.outcomeClassified,
      payload: {
        outcome: loopState.extraction.outcome,
        reason: loopState.extraction.outcomeReason,
        targetBlockId: loopState.targetBlockId,
      },
    });
  }

  private async recordLoopEvent(agentRunId: string, event: LoopEvent) {
    if (event.type === "loop_started") {
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.indexing.reactLoopStarted,
        payload: { maxRounds: event.maxRounds, maxCallsPerTool: event.maxCallsPerTool },
      });
      return;
    }
    if (event.type === "tool_called") {
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.tool.called,
        payload: { tool: event.tool, input: event.input, round: event.round },
      });
      return;
    }
    if (event.type === "tool_result") {
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.tool.result,
        payload: {
          tool: event.tool,
          outputSummary: event.result.ok ? summarizeToolOutput(event.result.output) : { error: event.result.error },
          round: event.round,
        },
      });
      return;
    }
    if (event.type === "tool_rejected") {
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.tool.result,
        payload: { tool: event.tool, outputSummary: { rejected: true, reason: event.reason }, round: event.round },
      });
      return;
    }
    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.indexing.loopExited,
      payload: { reason: event.reason, terminalTool: event.terminalTool },
    });
  }

  private async resolveIndexingSource(input: { rawSourceId: string | null }) {
    if (!this.rawSourceRepository) {
      throw new Error("compile worker requires a raw source repository");
    }
    if (!input.rawSourceId) {
      throw new Error("Raw source not found");
    }

    const rawSource = await this.rawSourceRepository.getById(input.rawSourceId);
    if (!rawSource) {
      throw new Error("Raw source not found");
    }

    const source = toWikiIndexingSource(rawSource);

    return { rawSource, source };
  }
}

function blockSummaryFromBlock(
  output: Awaited<ReturnType<AgentToolService["getBlock"]>>,
): Awaited<ReturnType<AgentToolService["searchBlocks"]>>["results"][number] {
  return {
    block_id: output.block.id,
    knowledge_source_id: output.block.knowledge_source_id,
    compiled_note_id: output.block.compiled_note_id,
    title: output.block.title,
    heading: output.block.heading,
    body_markdown_preview: output.block.body_markdown.slice(0, 320),
    rank: 0,
    linked_block_ids: [],
  };
}

/**
 * Deterministic, no-LLM runner that reproduces the historical fixed tool order.
 * It is the safe default (used by tests and any caller that does not opt in to
 * the LLM runner); production wires {@link createLlmCompileAgentRunner} via
 * {@link createApp}'s dependencies instead.
 */
function createScriptedCompileAgentRunner(context: CompileAgentRunnerContext): AgentRunner {
  const fetchedConceptLinkedBlockIds = new Set<string>();
  let classifiedTarget: { targetBlockId: string | null; conflictDetected: boolean } | null = null;

  return {
    async nextStep(view) {
      if (context.source.rawSourceId && !hasSuccessfulTool(view, "get_source")) {
        return { tool: "get_source", input: { source_id: context.source.rawSourceId } };
      }

      const shouldLookupConcepts =
        context.extraction.outcome !== "keep_searchable" &&
        context.extractedConceptNames.length > 0 &&
        !hasSuccessfulTool(view, "lookup_concepts");
      if (shouldLookupConcepts && view.availableTools.includes("lookup_concepts")) {
        return {
          tool: "lookup_concepts",
          input: { concepts: context.extractedConceptNames, fuzzy: true },
        };
      }

      if (!hasSuccessfulTool(view, "search_blocks")) {
        return {
          tool: "search_blocks",
          input: { query: context.source.bodyMarkdown.slice(0, 500), limit: 8 },
        };
      }

      const conceptLinkedBlockId = conceptLinkedBlockIds(view).find(
        (blockId) => !searchResultBlockIds(view).has(blockId) && !fetchedConceptLinkedBlockIds.has(blockId),
      );
      if (conceptLinkedBlockId && fetchedConceptLinkedBlockIds.size < 3 && view.availableTools.includes("get_block")) {
        fetchedConceptLinkedBlockIds.add(conceptLinkedBlockId);
        return { tool: "get_block", input: { block_id: conceptLinkedBlockId } };
      }

      classifiedTarget ??= await context.classifyOutcome(view);
      if (
        classifiedTarget.targetBlockId &&
        !hasSuccessfulGetBlock(view, classifiedTarget.targetBlockId) &&
        view.availableTools.includes("get_block")
      ) {
        return { tool: "get_block", input: { block_id: classifiedTarget.targetBlockId } };
      }
      if (
        classifiedTarget.targetBlockId &&
        classifiedTarget.conflictDetected &&
        !hasSuccessfulGetBlockHistory(view, classifiedTarget.targetBlockId) &&
        view.availableTools.includes("get_block_history")
      ) {
        return { tool: "get_block_history", input: { block_id: classifiedTarget.targetBlockId, limit: 5 } };
      }

      return { tool: "draft_proposal", input: context.buildDraftInput(view) };
    },
  };
}

function hasSuccessfulTool(view: LoopView, toolName: string) {
  return view.transcript.some((entry) => entry.tool === toolName && entry.result.ok);
}

function hasSuccessfulGetBlock(view: LoopView, blockId: string) {
  return view.transcript.some(
    (entry) =>
      entry.tool === "get_block" &&
      entry.result.ok &&
      (entry.input as { block_id?: string }).block_id === blockId,
  );
}

function hasSuccessfulGetBlockHistory(view: LoopView, blockId: string) {
  return view.transcript.some(
    (entry) =>
      entry.tool === "get_block_history" &&
      entry.result.ok &&
      (entry.input as { block_id?: string }).block_id === blockId,
  );
}

function refreshLoopObservations(loopState: CompileLoopState, view: LoopView) {
  for (const entry of view.transcript) {
    if (!entry.result.ok) continue;
    if (entry.tool === "get_source") {
      loopState.sourceToolOutput = entry.result.output as GetSourceOutput;
    }
    if (entry.tool === "lookup_concepts") {
      loopState.conceptLookup = entry.result.output as LookupConceptsOutput;
    }
    if (entry.tool === "search_blocks") {
      mergeCandidateBlocks(loopState, (entry.result.output as SearchBlocksOutput).results);
    }
    if (entry.tool === "get_block") {
      const output = entry.result.output as Awaited<ReturnType<AgentToolService["getBlock"]>>;
      loopState.fetchedBlocks.set(output.block.id, output);
      mergeCandidateBlocks(loopState, [blockSummaryFromBlock(output)]);
    }
  }
}

function mergeCandidateBlocks(loopState: CompileLoopState, blocks: SearchBlocksOutput["results"]) {
  const seen = new Set(loopState.candidateBlocks.map((block) => block.block_id));
  for (const block of blocks) {
    if (!seen.has(block.block_id)) {
      loopState.candidateBlocks.push(block);
      seen.add(block.block_id);
    }
  }
}

function searchResultBlockIds(view: LoopView) {
  const blockIds = new Set<string>();
  for (const entry of view.transcript) {
    if (entry.tool === "search_blocks" && entry.result.ok) {
      for (const block of (entry.result.output as SearchBlocksOutput).results) {
        blockIds.add(block.block_id);
      }
    }
  }
  return blockIds;
}

function conceptLinkedBlockIds(view: LoopView) {
  const blockIds: string[] = [];
  for (const entry of view.transcript) {
    if (entry.tool === "lookup_concepts" && entry.result.ok) {
      for (const match of (entry.result.output as LookupConceptsOutput).matches) {
        blockIds.push(...match.linked_block_ids);
      }
    }
  }
  return [...new Set(blockIds)];
}

function allowedBlockIdsFromState(loopState: CompileLoopState) {
  const blockIds = new Set(loopState.candidateBlocks.map((block) => block.block_id));
  for (const blockId of loopState.conceptLookup?.matches.flatMap((match) => match.linked_block_ids) ?? []) {
    blockIds.add(blockId);
  }
  for (const blockId of loopState.fetchedBlocks.keys()) {
    blockIds.add(blockId);
  }
  if (loopState.targetBlockId) {
    blockIds.add(loopState.targetBlockId);
  }
  return blockIds;
}

function blockIdFromInput(input: unknown) {
  if (!input || typeof input !== "object" || typeof (input as { block_id?: unknown }).block_id !== "string") {
    throw new Error("block_id is required");
  }
  return (input as { block_id: string }).block_id;
}

function isDraftProposalInput(input: unknown): input is DraftProposalInput {
  return Boolean(
    input &&
      typeof input === "object" &&
      typeof (input as { indexing_outcome?: unknown }).indexing_outcome === "string" &&
      Array.isArray((input as { items?: unknown }).items) &&
      Array.isArray((input as { suggested_links?: unknown }).suggested_links),
  );
}

function applyDraftOutcome(loopState: CompileLoopState, input: DraftProposalInput) {
  const firstItem = input.items.find((item) => item.action !== "keep_source_searchable") ?? null;
  loopState.extraction = {
    ...loopState.extraction,
    outcome: input.indexing_outcome,
    outcomeReason: input.outcome_reason,
    confidence: firstItem?.confidence ?? loopState.extraction.confidence,
  };
  loopState.targetBlockId = firstItem?.target_block_id ?? null;
  loopState.conflict = {
    detected: firstItem?.conflict_detected ?? false,
    summary: firstItem?.conflict_summary ?? null,
    resolution: firstItem?.conflict_resolution ?? null,
  };
}

function firstSourceSpan(chunks: Array<{ chunk_index: number; body_markdown: string }>) {
  const chunk = chunks.find((item) => item.body_markdown.trim()) ?? null;
  if (!chunk) return null;
  const text = chunk.body_markdown.trim().slice(0, 220);
  const charStart = chunk.body_markdown.indexOf(text);
  return {
    chunk_index: chunk.chunk_index,
    char_start: charStart,
    char_end: charStart + text.length,
    text,
  };
}

function contractChunks(source: WikiIndexingSource) {
  const chunks = source.chunks.map((chunk) => ({
    id: chunk.id,
    chunk_index: chunk.chunkIndex,
    heading: chunk.heading,
    body_markdown: chunk.bodyMarkdown,
    token_estimate: chunk.tokenEstimate,
  }));
  return chunks.length
    ? chunks
    : [{
        id: `${source.id}:body`,
        chunk_index: 0,
        heading: source.title,
        body_markdown: source.bodyMarkdown,
        token_estimate: Math.max(1, Math.ceil(source.bodyMarkdown.length / 4)),
      }];
}

function summarizeToolOutput(output: unknown) {
  if (!output || typeof output !== "object") return output;
  const record = output as Record<string, unknown>;
  if (Array.isArray(record.results)) return { resultCount: record.results.length };
  if (Array.isArray(record.matches)) return { matchCount: record.matches.length };
  if (Array.isArray(record.versions)) return { versionCount: record.versions.length };
  if (Array.isArray(record.chunks)) return { chunkCount: record.chunks.length };
  if (record.proposal_id) return { proposalId: record.proposal_id };
  if (record.block && typeof record.block === "object") {
    return { blockId: (record.block as Record<string, unknown>).id };
  }
  return record;
}

function toWikiIndexingSource(rawSource: RawSourceWithChunks): WikiIndexingSource {
  return {
    id: rawSource.id,
    // Source-first: the raw_source is canonical; the legacy raw_note link is no
    // longer carried through the compile pipeline.
    rawNoteId: null,
    rawSourceId: rawSource.id,
    userId: rawSource.userId,
    sourceRole: rawSource.sourceRole,
    sourceType: rawSource.sourceType,
    title: rawSource.title,
    bodyMarkdown: rawSource.bodyMarkdown,
    chunks: rawSource.chunks,
  };
}
