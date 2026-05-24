export type RawNote = {
  id: string;
  userId: string | null;
  domain: string | null;
  sourceType: string;
  title: string | null;
  bodyMarkdown: string;
  extractedData: unknown;
  createdAt: Date;
};

export type RawNoteWithProposal = {
  rawNote: RawNote;
  proposalId: string | null;
  agentRunId: string | null;
};

export type CreateRawNoteInput = {
  userId?: string | null;
  domain?: string | null;
  sourceType?: string;
  title?: string | null;
  bodyMarkdown: string;
};
