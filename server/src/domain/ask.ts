export type AskCitation = {
  blockId: string;
  title: string;
  chunkText: string;
  sourceNoteTitle: string;
  sourceNoteId: string;
};

export type AskResponse = {
  answer: string;
  citations: AskCitation[];
};

export type AskRequest = {
  query: string;
  topicIds?: string[];
};
