import type { CompiledNote } from "../domain/knowledge.js";
import type { AgentRunRepository } from "../repositories/agentRun.repository.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { NoteLinkRepository } from "../repositories/noteLink.repository.js";

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
  ) {}

  async enqueue(input: { userId?: string | null; runType: string; input?: unknown }) {
    if (input.runType !== "reindex_links") {
      throw new Error("Unsupported agent run type");
    }

    const agentRun = await this.agentRunRepository.enqueue({
      userId: input.userId,
      runType: input.runType,
      input: input.input ?? {},
    });
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      eventType: "queued",
      payload: { runType: input.runType },
    });

    return agentRun;
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
}
