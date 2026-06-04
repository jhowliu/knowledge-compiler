import type { AgentRun, CompiledNote } from "../../domain/knowledge.js";
import { agentRunEvents } from "../../domain/agentRunEvents.js";
import type { AgentRunRepository } from "../../repositories/agentRun.repository.js";
import type { KnowledgeRepository } from "../../repositories/knowledge.repository.js";
import type { NoteLinkRepository } from "../../repositories/noteLink.repository.js";
import type { AgentRunHandler } from "./agentRunHandler.js";

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

export class ReindexLinksHandler implements AgentRunHandler {
  readonly runType = "reindex_links";

  constructor(
    private readonly agentRunRepository: AgentRunRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly noteLinkRepository: NoteLinkRepository,
  ) {}

  async run(agentRun: AgentRun) {
    const notes = await this.knowledgeRepository.listCompiledNotes(maxNotesToScan);
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
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
      agentRunId: agentRun.id,
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
        createdByAgentRunId: agentRun.id,
      });
      if (noteLink) {
        suggestionsCreated += 1;
        await this.agentRunRepository.addEvent({
          agentRunId: agentRun.id,
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
}
