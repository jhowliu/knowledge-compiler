import type { RawSourceRole } from "./rawSource.js";

export type RawNote = {
  id: string;
  userId: string | null;
  rawSourceId: string | null;
  sourceType: string;
  sourceRole: RawSourceRole;
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
  rawSourceId?: string | null;
  subtype?: string | null;
  sourceType?: string;
  sourceRole?: RawSourceRole;
  topicIds?: string[];
  title?: string | null;
  bodyMarkdown: string;
};

export type UpdateRawNoteInput = {
  subtype?: string | null;
  sourceType?: string;
  sourceRole?: RawSourceRole;
  topicIds?: string[];
  title?: string | null;
  bodyMarkdown: string;
};
