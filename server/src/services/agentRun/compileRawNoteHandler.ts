import type { AgentRun } from "../../domain/knowledge.js";
import type { AgentRunRepository } from "../../repositories/agentRun.repository.js";
import type { KnowledgeRepository } from "../../repositories/knowledge.repository.js";
import type { ProposalRepository } from "../../repositories/proposal.repository.js";
import type { RawSourceRepository } from "../../repositories/rawSource.repository.js";
import type { RawSourceWithChunks } from "../../domain/rawSource.js";
import { agentRunEvents } from "../../domain/agentRunEvents.js";
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
import {
  createScriptedCompileAgentRunner,
  runCompileRawNoteAgentRuntime,
} from "./compileRawNoteAgentRuntime.js";
import type { AgentRunHandler } from "./agentRunHandler.js";
import type { CompileAgentRunnerFactory } from "./compileRunner.types.js";

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
    const rawSourceRepository = this.rawSourceRepository;
    if (!rawSourceRepository) {
      throw new Error("compile worker is not configured");
    }

    const { rawSource, source } = await this.resolveIndexingSource(input);
    const agentToolService = this.createAgentToolService(rawSourceRepository);

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

    const runtimeResult = await runCompileRawNoteAgentRuntime({
      agentRunId,
      rawSourceId: rawSource.id,
      source,
      extraction: extractedResult,
      extractedConceptNames: extractedConcepts.map((concept) => concept.name),
      relatedNotes,
      agentToolService,
      agentRunRepository: this.agentRunRepository,
      knowledgeRepository: this.knowledgeRepository,
      rawSourceRepository,
      wikiIndexerService: this.wikiIndexerService,
      compileAgentRunnerFactory: this.compileAgentRunnerFactory,
    });

    const draftProposalOutput = runtimeResult.proposalOutput;
    const finalExtraction = runtimeResult.extraction;

    return {
      rawNoteId: source.rawNoteId,
      rawSourceId: source.rawSourceId,
      sourceRole: source.sourceRole,
      chunkCount: source.chunks.length,
      proposalId: draftProposalOutput.proposal_id,
      provider,
      indexingOutcome: finalExtraction.outcome,
      detectedKnowledgeType: finalExtraction.knowledgeType,
      conceptCount: finalExtraction.structuredData.concepts.length,
      relatedNoteCount: relatedNotes.length,
    };
  }

  private createAgentToolService(rawSourceRepository: RawSourceRepository) {
    return new AgentToolService(
      rawSourceRepository,
      this.knowledgeRepository,
      this.proposalRepository,
      this.extractionEvalRepository,
      this.agentToolReadRepository,
    );
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
