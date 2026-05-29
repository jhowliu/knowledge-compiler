export const rawSourceRoles = ["reference", "personal_note"] as const;

export type RawSourceRole = (typeof rawSourceRoles)[number];

export type RawSource = {
  id: string;
  userId: string | null;
  domain: string | null;
  sourceType: string;
  sourceRole: RawSourceRole;
  title: string | null;
  bodyMarkdown: string;
  metadata: Record<string, unknown>;
  extractedData: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type RawSourceChunk = {
  id: string;
  rawSourceId: string;
  chunkIndex: number;
  heading: string | null;
  bodyMarkdown: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type RawSourceWithChunks = RawSource & {
  chunks: RawSourceChunk[];
};

export type CreateRawSourceInput = {
  userId?: string | null;
  domain?: string | null;
  sourceType?: string;
  sourceRole?: RawSourceRole;
  title?: string | null;
  bodyMarkdown: string;
  metadata?: Record<string, unknown>;
};

export type UpdateRawSourceInput = {
  domain?: string | null;
  sourceType?: string;
  sourceRole?: RawSourceRole;
  title?: string | null;
  bodyMarkdown: string;
  metadata?: Record<string, unknown>;
};

export type CreateRawSourceChunkInput = {
  chunkIndex: number;
  heading?: string | null;
  bodyMarkdown: string;
  tokenEstimate: number;
  metadata?: Record<string, unknown>;
};
