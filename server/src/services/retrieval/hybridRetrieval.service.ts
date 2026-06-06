import type {
  HybridRetrievalResult,
  MergedRetrievalCandidate,
  RetrievalCandidate,
  RetrievalCandidateSet,
  RetrievalQuery,
  Retriever,
} from "./retrieval.types.js";

const DEFAULT_RRF_K = 60;

export class HybridRetrievalService {
  constructor(
    private readonly retrievers: Retriever[],
    private readonly rrfK = DEFAULT_RRF_K,
  ) {}

  async search(input: RetrievalQuery): Promise<HybridRetrievalResult> {
    const candidateSets = await Promise.all(
      this.retrievers.map((retriever) => retriever.search(input)),
    );
    return mergeRetrievalCandidateSets(candidateSets, this.rrfK);
  }
}

export function mergeRetrievalCandidateSets(
  candidateSets: RetrievalCandidateSet[],
  rrfK = DEFAULT_RRF_K,
): HybridRetrievalResult {
  const byBlockId = new Map<string, MergedRetrievalCandidate>();

  for (const candidateSet of candidateSets) {
    if (candidateSet.status === "disabled") {
      continue;
    }

    for (const candidate of candidateSet.candidates) {
      const contribution = contributionFor(candidate, rrfK);
      const existing = byBlockId.get(candidate.blockId);
      if (existing) {
        existing.rank += contribution.contribution;
        existing.contributions.push(contribution);
      } else {
        byBlockId.set(candidate.blockId, {
          blockId: candidate.blockId,
          rank: contribution.contribution,
          contributions: [contribution],
        });
      }
    }
  }

  const candidates = [...byBlockId.values()].sort((left, right) => {
    if (right.rank !== left.rank) {
      return right.rank - left.rank;
    }
    return left.blockId.localeCompare(right.blockId);
  });

  return {
    candidates,
    trace: {
      sources: candidateSets.map((candidateSet) => ({
        source: candidateSet.source,
        status: candidateSet.status,
        reason: candidateSet.reason,
        candidateCount: candidateSet.candidates.length,
      })),
      merged: candidates,
    },
  };
}

function contributionFor(candidate: RetrievalCandidate, rrfK: number) {
  return {
    source: candidate.source,
    rankPosition: candidate.rankPosition,
    contribution: 1 / (rrfK + candidate.rankPosition),
    score: candidate.score,
    reason: candidate.reason,
  };
}
