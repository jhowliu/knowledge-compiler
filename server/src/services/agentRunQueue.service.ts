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
import { WikiIndexerService, type WikiIndexer, type WikiIndexingSource } from "./wikiIndexer.service.js";
import { compileRunMetadata } from "../agents/versions.js";
import type { ExtractionEvalRepository } from "../repositories/extractionEval.repository.js";
import { NoopExtractionEvalRepository } from "../repositories/extractionEval.repository.js";
import type { AgentToolReadRepository } from "../repositories/agentTool.repository.js";
import { NoopAgentToolReadRepository } from "../repositories/agentTool.repository.js";
import { AgentToolService } from "./agentTool.service.js";
import { normalizeKnowledgeStructuredData } from "./knowledgeFacets.service.js";

const maxNotesToScan = 80;
const maxSuggestions = 12;

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
      eventType: "queued",
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
      eventType: "retry_queued",
      payload: { retryAgentRunId: retryRun.id },
    });
    await this.agentRunRepository.addEvent({
      agentRunId: retryRun.id,
      eventType: "retry_of",
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
      eventType: "run_started",
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
          eventType: "run_completed",
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
        eventType: "run_completed",
        payload: output,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown agent run error";
      await this.agentRunRepository.fail(agentRun.id, message);
      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        eventType: "run_failed",
        payload: { error: message },
      });
      throw error;
    }
  }

  private async reindexLinks(agentRunId: string) {
    const notes = await this.knowledgeRepository.listCompiledNotes(maxNotesToScan);
    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "notes_loaded",
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
      eventType: "link_candidates_scored",
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
          eventType: "link_suggestion_created",
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

    const { rawNote, rawSource, source } = await this.resolveIndexingSource(input);
    const agentToolService = this.createAgentToolService();

    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "raw_note_loaded",
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
        eventType: "raw_source_loaded",
        payload: {
          rawSourceId: rawSource.id,
          chunkCount: rawSource.chunks.length,
          sourceRole: rawSource.sourceRole,
          sourceType: rawSource.sourceType,
        },
      });
    }

    let round = 1;
    let sourceToolOutput: Awaited<ReturnType<AgentToolService["getSource"]>> | null = null;
    if (agentToolService) {
      await this.agentRunRepository.addEvent({
        agentRunId,
        eventType: "react_loop_started",
        payload: { maxRounds: 8, maxCallsPerTool: 3 },
      });

      if (source.rawSourceId) {
        sourceToolOutput = await this.callTool(agentRunId, round, "get_source", { source_id: source.rawSourceId }, () =>
          agentToolService.getSource({ source_id: source.rawSourceId! }),
        );
        round += 1;
      }
    }

    const { extraction, provider } = await this.wikiIndexerService.extract(source);
    const extractedConcepts = extraction.structuredData.concepts;
    await this.rawNoteRepository.updateExtraction(rawNote.id, extraction, extraction.domain);
    if (rawSource && this.rawSourceRepository) {
      await this.rawSourceRepository.updateExtraction(rawSource.id, extraction);
    }
    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "detection_completed",
      payload: {
        provider,
        knowledgeType: extraction.knowledgeType,
        concepts: extractedConcepts,
      },
    });

    const conceptLookup =
      agentToolService && extractedConcepts.length
        ? await this.callTool(
            agentRunId,
            round,
            "lookup_concepts",
            { concepts: extractedConcepts.map((concept) => concept.name), fuzzy: true },
            () => agentToolService.lookupConcepts({
              concepts: extractedConcepts.map((concept) => concept.name),
              fuzzy: true,
            }),
          )
        : { matches: [] };
    if (agentToolService && extractedConcepts.length) round += 1;

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
      eventType: "wiki_index_drafted",
      payload: {
        provider,
        conceptCount: extractedConcepts.length,
        claimCount: extraction.structuredData.claims.length,
        methodCount: extraction.structuredData.methods.length,
      },
    });

    const relatedNotes = await this.knowledgeRepository.searchRelated({
      query: source.bodyMarkdown,
      conceptNames: extractedConcepts.map((concept) => concept.name),
      limit: 8,
    });
    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "related_knowledge_found",
      payload: { relatedNotes },
    });

    const draft = this.wikiIndexerService.draftProposal(source, extraction, relatedNotes);
    if (!agentToolService) {
      const proposal = await this.proposalRepository.create({
        userId: rawNote.userId,
        rawNoteId: rawNote.id,
        draft,
      });
      await this.agentRunRepository.addEvent({
        agentRunId,
        eventType: "proposal_created",
        payload: { proposalId: proposal.id },
      });

      return {
        rawNoteId: rawNote.id,
        rawSourceId: source.rawSourceId,
        sourceRole: rawNote.sourceRole,
        chunkCount: source.chunks.length,
        proposalId: proposal.id,
        provider,
        detectedKnowledgeType: extraction.knowledgeType,
        conceptCount: extractedConcepts.length,
        relatedNoteCount: relatedNotes.length,
      };
    }

    const blockSearch = await this.callTool(
      agentRunId,
      round,
      "search_blocks",
      { query: source.bodyMarkdown.slice(0, 500), limit: 8 },
      () => agentToolService.searchBlocks({ query: source.bodyMarkdown.slice(0, 500), limit: 8 }),
    );
    round += 1;

    const firstBlock = blockSearch.results[0]
      ? await this.callTool(
          agentRunId,
          round,
          "get_block",
          { block_id: blockSearch.results[0].block_id },
          () => agentToolService.getBlock({ block_id: blockSearch.results[0]!.block_id }),
        )
      : null;
    if (firstBlock) round += 1;

    const conflictDetected = firstBlock ? hasConflictSignal(source.bodyMarkdown) : false;
    if (conflictDetected && firstBlock) {
      await this.callTool(
        agentRunId,
        round,
        "get_block_history",
        { block_id: firstBlock.block.id, limit: 5 },
        () => agentToolService.getBlockHistory({ block_id: firstBlock.block.id, limit: 5 }),
      );
      round += 1;
    }

    const proposalChunks = sourceToolOutput?.chunks ?? contractChunks(source);
    const sourceSpan = firstSourceSpan(proposalChunks);
    const draftProposalOutput = await this.callTool(
      agentRunId,
      round,
      "draft_proposal",
      { itemCount: draft.items.length },
      () => agentToolService.draftProposal(
        {
          agentRunId,
          rawNoteId: rawNote.id,
          sourceId: source.rawSourceId ?? source.id,
          userId: rawNote.userId,
          sourceText: source.bodyMarkdown,
          chunks: proposalChunks,
          existingBlocksContext: blockSearch.results,
        },
        {
          reasoning_summary: draft.rationale,
          incomplete_reasoning: false,
          items: draft.items
            .filter((item) => item.actionType === "upsert_knowledge")
            .map((item) => {
              const payload = item.payload as Record<string, unknown>;
              return {
                action: "upsert_knowledge" as const,
                target_block_id: firstBlock?.block.id ?? null,
                title: typeof payload.title === "string" ? payload.title : source.title ?? "Untitled knowledge",
                body_markdown: typeof payload.bodyMarkdown === "string" ? payload.bodyMarkdown : source.bodyMarkdown,
                structured_facets: normalizeKnowledgeStructuredData(
                  payload.structuredData ?? extraction.structuredData,
                ),
                source_concept_ids: conceptLookup.matches
                  .map((match) => match.concept_id)
                  .filter((id): id is string => Boolean(id)),
                source_spans: sourceSpan ? [sourceSpan] : [],
                confidence: extraction.confidence,
                conflict_detected: conflictDetected,
                conflict_summary: conflictDetected
                  ? "The source appears to contradict or revise existing knowledge."
                  : null,
                conflict_resolution: conflictDetected ? ("needs_user_decision" as const) : null,
              };
            }),
          suggested_links: blockSearch.results.slice(0, 2).map((result) => ({
            source_block_id: null,
            target_block_id: result.block_id,
            relation_type: "related_concept",
            confidence: "medium" as const,
            rationale: `Search found related block: ${result.title}.`,
          })),
        },
      ),
    );
    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "proposal_created",
      payload: { proposalId: draftProposalOutput.proposal_id },
    });
    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "loop_exited",
      payload: { reason: "draft_proposal" },
    });

    return {
      rawNoteId: rawNote.id,
      rawSourceId: source.rawSourceId,
      sourceRole: rawNote.sourceRole,
      chunkCount: source.chunks.length,
      proposalId: draftProposalOutput.proposal_id,
      provider,
      detectedKnowledgeType: extraction.knowledgeType,
      conceptCount: extractedConcepts.length,
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

  private async callTool<T>(
    agentRunId: string,
    round: number,
    tool: string,
    input: unknown,
    action: () => Promise<T>,
  ) {
    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "tool_called",
      payload: { tool, input, round },
    });
    const output = await action();
    await this.agentRunRepository.addEvent({
      agentRunId,
      eventType: "tool_result",
      payload: { tool, outputSummary: summarizeToolOutput(output), round },
    });
    return output;
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

function hasConflictSignal(text: string) {
  return /\b(conflict|contradict|instead|however|but|no longer|not true)\b/i.test(text);
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
