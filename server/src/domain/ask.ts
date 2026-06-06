export type AskCitation = {
  blockId: string;
  title: string;
  chunkText: string;
  sourceNoteTitle: string;
  sourceNoteId: string;
  // Provenance: "knowledge" = approved canonical knowledge; "source" = the
  // user's raw source notes, used as a fallback when no knowledge matched.
  tier: "knowledge" | "source";
};

export type AskResponse = {
  answer: string;
  citations: AskCitation[];
};

export type AskRequest = {
  query: string;
  topicIds?: string[];
};
