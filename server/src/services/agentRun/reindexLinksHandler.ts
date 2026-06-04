import type { AgentRun, CompiledNote } from "../../domain/knowledge.js";
import { agentRunEvents } from "../../domain/agentRunEvents.js";
import type { AgentRunRepository } from "../../repositories/agentRun.repository.js";
import type { KnowledgeRepository } from "../../repositories/knowledge.repository.js";
import type { NoteLinkRepository } from "../../repositories/noteLink.repository.js";
import type { AgentRunHandler } from "./agentRunHandler.js";
import { createLlmLinkJudge, type LinkJudge } from "./linkJudge.js";

const maxNotesToScan = 80;
// How many candidate pairs to actually run through the agent judge per run.
const maxCandidatesToJudge = 24;

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

/**
 * Deterministic candidate *generation* only — it selects which note pairs are
 * worth judging (keyword/title overlap), NOT whether they should link. The
 * link decision is the agent's (#98 option A).
 */
function candidateScore(left: CompiledNote, right: CompiledNote) {
  const leftKeywords = keywordsFor(left);
  const rightKeywords = keywordsFor(right);
  const shared = [...leftKeywords].filter((keyword) => rightKeywords.has(keyword)).length;
  const titleOverlap =
    left.title.toLowerCase().includes(right.title.toLowerCase()) ||
    right.title.toLowerCase().includes(left.title.toLowerCase());
  return shared + (titleOverlap ? 3 : 0);
}

export class ReindexLinksHandler implements AgentRunHandler {
  readonly runType = "reindex_links";

  constructor(
    private readonly agentRunRepository: AgentRunRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly noteLinkRepository: NoteLinkRepository,
    private readonly linkJudge: LinkJudge = createLlmLinkJudge(),
  ) {}

  async run(agentRun: AgentRun) {
    const notes = await this.knowledgeRepository.listCompiledNotes(maxNotesToScan);
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      ...agentRunEvents.source.notesLoaded,
      payload: { count: notes.length },
    });

    // Candidate generation (deterministic): pick the most promising pairs.
    const candidates: Array<{ left: CompiledNote; right: CompiledNote; score: number }> = [];
    for (let leftIndex = 0; leftIndex < notes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < notes.length; rightIndex += 1) {
        const left = notes[leftIndex];
        const right = notes[rightIndex];
        const score = candidateScore(left, right);
        if (score >= 2) {
          candidates.push({ left, right, score });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const toJudge = candidates.slice(0, maxCandidatesToJudge);
    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      ...agentRunEvents.linking.candidatesFound,
      payload: { candidateCount: candidates.length, judging: toJudge.length },
    });

    // Link decision (the agent): judge each candidate pair, keep medium/high.
    let suggestionsCreated = 0;
    for (const candidate of toJudge) {
      const judgment = await this.linkJudge({
        source: noteForJudge(candidate.left),
        target: noteForJudge(candidate.right),
      });
      if (!judgment.should_link || judgment.confidence === "low") {
        continue;
      }
      const noteLink = await this.noteLinkRepository.createSuggestion({
        userId: candidate.left.userId,
        sourceNoteType: "compiled_note",
        sourceNoteId: candidate.left.id,
        targetNoteType: "compiled_note",
        targetNoteId: candidate.right.id,
        relationType: judgment.relation_type,
        confidence: judgment.confidence,
        rationale: judgment.rationale,
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

    await this.agentRunRepository.addEvent({
      agentRunId: agentRun.id,
      ...agentRunEvents.linking.judged,
      payload: {
        candidateCount: candidates.length,
        judgedCount: toJudge.length,
        linkedCount: suggestionsCreated,
      },
    });

    return {
      notesScanned: notes.length,
      candidateCount: candidates.length,
      judgedCount: toJudge.length,
      suggestionsCreated,
    };
  }
}

function noteForJudge(note: CompiledNote) {
  return { id: note.id, title: note.title, noteType: note.noteType, bodyMarkdown: note.bodyMarkdown };
}
