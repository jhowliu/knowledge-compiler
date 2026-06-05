import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { ProposalRepository } from "../repositories/proposal.repository.js";
import type { RawNoteRepository } from "../repositories/rawNote.repository.js";
import { agentRunEvents } from "../domain/agentRunEvents.js";
import { CodingCompilerService } from "./codingCompiler.service.js";

export class PhaseOneWorkflowService {
  constructor(
    private readonly rawNoteRepository: RawNoteRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly proposalRepository: ProposalRepository,
    private readonly agentRunRepository: AgentRunRepository,
    private readonly codingCompilerService = new CodingCompilerService(),
  ) {}

  async ingestRawNote(rawNoteId: string) {
    const rawNote = await this.rawNoteRepository.getById(rawNoteId);
    if (!rawNote) {
      throw new Error("Raw note not found");
    }

    const agentRun = await this.agentRunRepository.create({
      userId: rawNote.userId,
      runType: "coding_note_ingestion",
      input: { rawNoteId },
    });

    try {
      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.indexing.classificationStarted,
        payload: { rawNoteId },
      });

      const extraction = this.codingCompilerService.extract(rawNote);
      await this.rawNoteRepository.updateExtraction(rawNote.id, extraction, extraction.domain);

      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.indexing.extractionCompleted,
        payload: extraction,
      });

      for (const concept of extraction.concepts) {
        const savedConcept = await this.knowledgeRepository.upsertConcept({
          userId: rawNote.userId,
          name: concept.name,
          conceptType: concept.conceptType,
        });
        await this.knowledgeRepository.indexConcept({
          userId: rawNote.userId,
          conceptId: savedConcept.id,
          targetType: "raw_note",
          targetId: rawNote.id,
          relationType: "mentions",
          confidence: concept.confidence,
          source: "phase_one_compiler",
        });
      }

      const relatedNotes = await this.knowledgeRepository.searchRelated({
        query: rawNote.bodyMarkdown,
        conceptNames: extraction.concepts.map((concept) => concept.name),
        limit: 8,
      });

      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.indexing.relatedFound,
        payload: { relatedNotes },
      });

      const draft = this.codingCompilerService.draftProposal(rawNote, extraction, relatedNotes);
      const proposal = await this.proposalRepository.create({
        userId: rawNote.userId,
        rawNoteId: rawNote.id,
        rawSourceId: rawNote.rawSourceId,
        draft,
      });

      await this.agentRunRepository.addEvent({
        agentRunId: agentRun.id,
        ...agentRunEvents.proposal.created,
        payload: { proposalId: proposal.id },
      });
      await this.agentRunRepository.complete(agentRun.id, { proposalId: proposal.id });

      return { agentRunId: agentRun.id, proposal };
    } catch (error) {
      await this.agentRunRepository.fail(
        agentRun.id,
        error instanceof Error ? error.message : "Unknown agent run error",
      );
      throw error;
    }
  }
}
