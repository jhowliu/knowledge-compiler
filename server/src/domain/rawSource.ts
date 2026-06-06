export const rawSourceRoles = ["reference", "personal_note"] as const;

export type RawSourceRole = (typeof rawSourceRoles)[number];

export type RawSource = {
  id: string;
  userId: string | null;
  projectId: string | null;
  folderId: string | null;
  domain: string | null;
  subtype: string | null;
  sourceType: string;
  sourceRole: RawSourceRole;
  topicIds: string[];
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
  projectId?: string | null;
  folderId?: string | null;
  domain?: string | null;
  subtype?: string | null;
  sourceType?: string;
  sourceRole?: RawSourceRole;
  topicIds?: string[];
  title?: string | null;
  bodyMarkdown: string;
  metadata?: Record<string, unknown>;
};

export type UpdateRawSourceInput = {
  projectId?: string | null;
  folderId?: string | null;
  domain?: string | null;
  subtype?: string | null;
  sourceType?: string;
  sourceRole?: RawSourceRole;
  topicIds?: string[];
  title?: string | null;
  bodyMarkdown: string;
  metadata?: Record<string, unknown>;
};

export type MoveRawSourceInput = {
  projectId: string;
  folderId?: string | null;
};

export type CreateRawSourceChunkInput = {
  chunkIndex: number;
  heading?: string | null;
  bodyMarkdown: string;
  tokenEstimate: number;
  metadata?: Record<string, unknown>;
};

export type SourceChunkSearchResult = {
  chunkId: string;
  rawSourceId: string;
  title: string | null;
  heading: string | null;
  bodyMarkdown: string;
  sourceRole: string;
  rank: number;
  createdAt: Date;
};

export type SourceFolder = {
  id: string;
  projectId: string;
  userId: string | null;
  name: string;
  sourceCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceProject = {
  id: string;
  userId: string | null;
  name: string;
  sourceCount: number;
  uncategorizedSourceCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  folders: SourceFolder[];
};

export type SourceOrganization = {
  projects: SourceProject[];
};

export type CreateSourceProjectInput = {
  userId?: string | null;
  name: string;
  metadata?: Record<string, unknown>;
};

export type CreateSourceFolderInput = {
  userId?: string | null;
  name: string;
  metadata?: Record<string, unknown>;
};

export type RenameSourceProjectInput = {
  name: string;
};

export type RenameSourceFolderInput = {
  name: string;
};
