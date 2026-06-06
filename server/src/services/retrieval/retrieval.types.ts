export const retrievalSources = ["fts", "concept", "vector", "bm25", "graph"] as const;

export type RetrievalSource = (typeof retrievalSources)[number];

export type RetrievalQuery = {
  query: string;
  limit: number;
  includeArchived?: boolean;
  topicIds?: string[];
  queryEmbedding?: number[] | null;
};

export type RetrievalCandidate = {
  blockId: string;
  source: RetrievalSource;
  rankPosition: number;
  score?: number;
  reason?: string;
};

export type RetrievalCandidateSet = {
  source: RetrievalSource;
  status: "enabled" | "disabled";
  reason?: string;
  candidates: RetrievalCandidate[];
};

export type RetrievalContribution = {
  source: RetrievalSource;
  rankPosition: number;
  contribution: number;
  score?: number;
  reason?: string;
};

export type MergedRetrievalCandidate = {
  blockId: string;
  rank: number;
  contributions: RetrievalContribution[];
};

export type RetrievalTrace = {
  sources: Array<{
    source: RetrievalSource;
    status: RetrievalCandidateSet["status"];
    reason?: string;
    candidateCount: number;
  }>;
  merged: MergedRetrievalCandidate[];
};

export type HybridRetrievalResult = {
  candidates: MergedRetrievalCandidate[];
  trace: RetrievalTrace;
};

export interface Retriever {
  readonly source: RetrievalSource;
  search(input: RetrievalQuery): Promise<RetrievalCandidateSet>;
}
