import type { CompiledNote } from "../domain/knowledge.js";
import { AppError } from "../domain/errors.js";
import type { RawNote } from "../domain/rawNote.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { NoteLinkRepository } from "../repositories/noteLink.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";
import type { RawNoteRepository } from "../repositories/rawNote.repository.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";
import type { RawSourceWithChunks } from "../domain/rawSource.js";
import { agentRunEvents } from "../domain/agentRunEvents.js";
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
} from "./wikiIndexer.service.js";
import { compileRunMetadata } from "../agents/versions.js";
import type { ExtractionEvalRepository } from "../repositories/extractionEval.repository.js";
import { NoopExtractionEvalRepository } from "../repositories/extractionEval.repository.js";
import type { AgentToolReadRepository } from "../repositories/agentTool.repository.js";
import { NoopAgentToolReadRepository } from "../repositories/agentTool.repository.js";
import { AgentToolService } from "./agentTool.service.js";
import { normalizeKnowledgeStructuredData } from "./knowledgeFacets.service.js";
import {
  runAgentLoop,
  type AgentRunner,
  type LoopEvent,
  type LoopTool,
  type LoopView,
} from "./agentLoop.js";

const maxNotesToScan = 80;
const maxSuggestions = 12;

export type CompileAgentRunnerContext = {
  source: WikiIndexingSource;
  extraction: GeneralCompileExtraction;
  extractedConceptNames: string[];
  classifyOutcome(view: LoopView): Promise<{
    targetBlockId: string | null;
    conflictDetected: boolean;
  }>;
  buildDraftInput(view: LoopView, options?: { incompleteReasoning?: boolean; reason?: string }): DraftProposalInput;
};

type GeneralCompileExtraction = Awaited<ReturnType<WikiIndexer["extract"]>>["extraction"];

export type CompileAgentRunnerFactory = (context: CompileAgentRunnerContext) => AgentRunner;

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

function keywordsFor(note: CompiledNote) {
  const words = `${note.title} ${note.noteType} ${note.bodyMarkdown}`
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "when",
    "that",
    "this",
    "should",
    "note",
    "review",
    "problem",
    "algorithm",
    "using",
  ]);
  return new Set(words.filter((word) => !stopWords.has(word)));
}

function scorePair(left: CompiledNote, right: CompiledNote) {
  const leftKeywords = keywordsFor(left);
  const rightKeywords = keywordsFor(right);
  const shared = [...leftKeywords].filter((keyword) => rightKeywords.has(keyword));
  const titleOverlap =
    left.title.toLowerCase().includes(right.title.toLowerCase()) ||
    right.title.toLowerCase().includes(left.title.toLowerCase());
  const typeBonus = left.noteType === right.noteType ? 0.5 : 0;
  return {
    score: shared.length + (titleOverlap ? 3 : 0) + typeBonus,
    shared: shared.slice(0, 6),
  };
}

export class AgentRunQueueService {
  constructor(
    private readonly agentRunRepository: AgentRunRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly noteLinkRepository: NoteLinkRepository,
    private readonly rawNoteRepository?: RawNoteRepository,
    private readonly proposalRepository?: ProposalRepository,
    private readonly wikiIndexerService: WikiIndexer = new WikiIndexerService(),
    private readonly rawSourceRepository?: RawSourceRepository | null,
    private readonly extractionEvalRepository: ExtractionEvalRepository = new NoopExtractionEvalRepository(),
    private readonly agentToolReadRepository: AgentToolReadRepository = new NoopAgentToolReadRepository(),
    private readonly compileAgentRunnerFactory: CompileAgentRunnerFactory = createScriptedCompileAgentRunner,
  ) {}

  async enqueue(input: { userId?: string | null; runType: string; input?: unknown }) {
    if (!["reindex_links", "compile_raw_note"].includes(input.runType)) {
      throw new Error("Unsupported agent run type");
    }
    const runInput = input.input && typeof input.input === "object" ? input.input : {};
    if (
      input.runType === "compile_raw_note" &&
      typeof (runInput as Record<string, unknown>).rawNoteId !== "string" &&
      typeof (runInput as Record<string, unknown>).rawSourceId !== "string"
    ) {
      throw new Error("compile_raw_note requires rawSourceId or rawNoteId");
    }

    const agentRun = await this.agentRunRepository.enqueue({
      userId: input.userId,
      runType: input.runType,
      input: runInput,
    });
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      ...agentRunEvents.lifecycle.queued,
      payload: { runType: input.runType },
    });

    return agentRun;
  }

  async retry(agentRunId: string) {
    const originalRun = await this.agentRunRepository.getById(agentRunId);
    if (!originalRun) {
      throw new AppError("Agent run not found", 404);
    }
    if (originalRun.status !== "failed") {
      throw new AppError("Only failed agent runs can be retried", 400);
    }

    const originalInput =
      originalRun.input && typeof originalRun.input === "object"
        ? (originalRun.input as Record<string, unknown>)
        : {};
    const retryRun = await this.enqueue({
      userId: originalRun.userId,
      runType: originalRun.runType,
      input: {
        ...originalInput,
        retryOfAgentRunId: originalRun.id,
      },
    });
    await this.agentRunRepository.addEvent({
      agentRunId: originalRun.id,
      ...agentRunEvents.lifecycle.retryQueued,
      payload: { retryAgentRunId: retryRun.id },
    });
    await this.agentRunRepository.addEvent({
      agentRunId: retryRun.id,
      ...agentRunEvents.lifecycle.retryOf,
      payload: { originalAgentRunId: originalRun.id },
    });

    return retryRun;
  }

  async process(agentRunId: string) {
    const agentRun = await this.agentRunRepository.getById(agentRunId);
    if (!agentRun) {
      throw new Error("Agent run not found");
    }

    await this.agentRunRepository.start(agentRun.id);
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      ...agentRunEvents.lifecycle.started,
      payload: { runType: agentRun.runType },
    });

    try {
      if (agentRun.runType === "compile_raw_note") {
        await this.agentRunRepository.updateMetadata(agentRun.id, compileRunMetadata());
        const input =
          agentRun.input && typeof agentRun.input === "object"
            ? (agentRun.input as Record<string, unknown>)
            : {};
        const output = await this.compileRawNote(agentRun.id, {
          rawNoteId: typeof input.rawNoteId === "string" ? input.rawNoteId : null,
          rawSourceId: typeof input.rawSourceId === "string" ? input.rawSourceId : null,
        });
        await this.agentRunRepository.complete(agentRun.id, output);
        await this.agentRunRepository.addEvent({
          agentRunId: agentRun.id,
          ...agentRunEvents.lifecycle.completed,
          payload: output,
        });
        return;
      }

      if (agentRun.runType !== "reindex_links") {
        throw new Error(`Unsupported agent run type: ${agentRun.runType}`);
      }

      const output = await this.reindexLinks(agentRun.id);
      await this.agentRunRepository.complete(agentRun.id, output);
      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.lifecycle.completed,
        payload: output,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent run error";
      await this.agentRunRepository.fail(agentRun.id, message);
      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.lifecycle.failed,
        payload: { error: message },
      });
      throw error;
    }
  }

  private async reindexLinks(agentRunId: string) {
    const notes = await this.knowledgeRepository.listCompiledNotes(maxNotesToScan);
    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.source.notesLoaded,
      payload: { count: notes.length },
    });

    const candidates = [];
    for (let leftIndex = 0; leftIndex < notes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < notes.length; rightIndex += 1) {
        const left = notes[leftIndex];
        const right = notes[rightIndex];
        const scored = scorePair(left, right);
        if (scored.score >= 2) {
          candidates.push({ left, right, ...scored });
        }
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.linking.scored,
      payload: { candidateCount: candidates.length },
    });

    let suggestionsCreated = 0;
    for (const candidate of candidates.slice(0, maxSuggestions)) {
      const noteLink = await this.noteLinkRepository.createSuggestion({
        userId: candidate.left.userId,
        sourceNoteType: "compiled_note",
        sourceNoteId: candidate.left.id,
        targetNoteType: "compiled_note",
        targetNoteId: candidate.right.id,
        relationType: "related_concept",
        confidence: candidate.score >= 5 ? "high" : "medium",
        rationale: candidate.shared.length
          ? `Agent re-index found shared signals: ${candidate.shared.join(", ")}.`
          : "Agent re-index found overlapping titles and note types.",
        createdByAgentRunId: agentRunId,
      });
      if (noteLink) {
        suggestionsCreated += 1;
        await this.agentRunRepository.addEvent({
          agentRunId,
          ...agentRunEvents.linking.suggestionCreated,
          payload: { noteLinkId: noteLink.id },
        });
      }
    }

    return {
      notesScanned: notes.length,
      candidateCount: candidates.length,
      suggestionsCreated,
    };
  }

  private async compileRawNote(
    agentRunId: string,
    input: { rawNoteId: string | null; rawSourceId: string | null },
  ) {
    if (!this.rawNoteRepository || !this.proposalRepository) {
      throw new Error("compile_raw_note worker is not configured");
    }
    const rawNoteRepository = this.rawNoteRepository;
    const proposalRepository = this.proposalRepository;

    const { rawNote, rawSource, source } = await this.resolveIndexingSource(input);
    const agentToolService = this.createAgentToolService();

    await this.agentRunRepository.addEvent({
      agentRunId,
      ...agentRunEvents.source.rawNoteLoaded,
      payload: {
        rawNoteId: rawNote.id,
        rawSourceId: source.rawSourceId,
        sourceRole: rawNote.sourceRole,
        sourceType: rawNote.sourceType,
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

    if (!agentToolService) {
      for (const concept of extractedConcepts) {
        const savedConcept = await this.knowledgeRepository.upsertConcept({
          userId: rawNote.userId,
          name: concept.name,
          conceptType: concept.type,
        });
        await this.knowledgeRepository.indexConcept({
          userId: rawNote.userId,
          conceptId: savedConcept.id,
          targetType: source.rawSourceId ? "raw_source" : "raw_note",
          targetId: source.rawSourceId ?? rawNote.id,
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
      await rawNoteRepository.updateExtraction(rawNote.id, extractedResult, extractedResult.domain);
      if (rawSource && this.rawSourceRepository) {
        await this.rawSourceRepository.updateExtraction(rawSource.id, extractedResult);
      }
      const draft = this.wikiIndexerService.draftProposal(source, extractedResult, relatedNotes);
      const proposal = await proposalRepository.create({
        userId: rawNote.userId,
        rawNoteId: rawNote.id,
        draft,
      });
      await this.agentRunRepository.addEvent({
        agentRunId,
        ...agentRunEvents.proposal.created,
        payload: { proposalId: proposal.id },
      });

      return {
        rawNoteId: rawNote.id,
        rawSourceId: source.rawSourceId,
        sourceRole: rawNote.sourceRole,
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
          userId: rawNote.userId,
          name: concept.name,
          conceptType: concept.type,
        });
        loopState.conceptIds.push(savedConcept.id);
        await this.knowledgeRepository.indexConcept({
          userId: rawNote.userId,
          conceptId: savedConcept.id,
          targetType: source.rawSourceId ? "raw_source" : "raw_note",
          targetId: source.rawSourceId ?? rawNote.id,
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
      await rawNoteRepository.updateExtraction(rawNote.id, loopState.extraction, loopState.extraction.domain);
      if (rawSource && this.rawSourceRepository) {
        await this.rawSourceRepository.updateExtraction(rawSource.id, loopState.extraction);
      }
      const proposalOutput = await agentToolService.draftProposal(
        {
          agentRunId,
          rawNoteId: rawNote.id,
          sourceId: source.rawSourceId ?? source.id,
          userId: rawNote.userId,
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
      rawNoteId: rawNote.id,
      rawSourceId: source.rawSourceId,
      sourceRole: rawNote.sourceRole,
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

  private async resolveIndexingSource(input: { rawNoteId: string | null; rawSourceId: string | null }) {
    let rawNote = input.rawNoteId ? await this.rawNoteRepository?.getById(input.rawNoteId) : null;
    if (input.rawNoteId && !rawNote) {
      throw new Error("Raw note not found");
    }

    const rawSourceId = input.rawSourceId ?? rawNote?.rawSourceId ?? null;
    const rawSource = rawSourceId && this.rawSourceRepository
      ? await this.rawSourceRepository.getById(rawSourceId)
      : null;
    if (rawSourceId && this.rawSourceRepository && !rawSource) {
      throw new Error("Raw source not found");
    }

    rawNote = rawNote ?? (input.rawSourceId ? await this.rawNoteRepository?.getByRawSourceId(input.rawSourceId) : null);
    if (!rawNote && !rawSource) {
      throw new Error("Raw note not found");
    }

    rawNote = rawNote ?? await this.rawNoteRepository!.create({
      userId: rawSource!.userId,
      rawSourceId: rawSource!.id,
      domain: rawSource!.domain,
      sourceType: rawSource!.sourceType,
      sourceRole: rawSource!.sourceRole,
      title: rawSource!.title,
      bodyMarkdown: rawSource!.bodyMarkdown,
    });
    const source = toWikiIndexingSource(rawNote, rawSource);

    return { rawNote, rawSource, source };
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

function toWikiIndexingSource(
  rawNote: RawNote,
  rawSource: RawSourceWithChunks | null,
): WikiIndexingSource {
  return {
    id: rawSource?.id ?? rawNote.id,
    rawNoteId: rawNote.id,
    rawSourceId: rawSource?.id ?? rawNote.rawSourceId,
    userId: rawNote.userId,
    sourceRole: rawSource?.sourceRole ?? rawNote.sourceRole,
    sourceType: rawSource?.sourceType ?? rawNote.sourceType,
    title: rawSource?.title ?? rawNote.title,
    bodyMarkdown: rawSource?.bodyMarkdown ?? rawNote.bodyMarkdown,
    chunks: rawSource?.chunks ?? [],
  };
}
