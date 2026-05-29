export type Confidence = "low" | "medium" | "high";

export type ReadinessStatus = "Missing" | "Weak" | "Needs Review" | "Okay" | "Strong";

export type Concept = {
  id: string;
  userId: string | null;
  name: string;
  normalizedName: string;
  conceptType: string;
  createdAt: Date;
};

export type CompiledNote = {
  id: string;
  userId: string | null;
  domain: string;
  noteType: string;
  title: string;
  bodyMarkdown: string;
  structuredData: unknown;
  status: string;
  lastReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeSource = {
  id: string;
  userId: string | null;
  domain: string;
  knowledgeType: string;
  title: string;
  status: string;
  currentVersionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeVersion = {
  id: string;
  knowledgeSourceId: string;
  compiledNoteId: string | null;
  proposalId: string | null;
  versionNumber: number;
  title: string;
  bodyMarkdown: string;
  structuredData: unknown;
  changeSummary: string | null;
  createdAt: Date;
};

export type KnowledgeBlock = {
  id: string;
  knowledgeSourceId: string;
  knowledgeVersionId: string;
  blockIndex: number;
  heading: string | null;
  bodyMarkdown: string;
  tokenEstimate: number;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeEvidenceReference = {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceTitle: string | null;
  rawSourceId: string | null;
  rawSourceTitle: string | null;
  rawSourceChunkId: string | null;
  chunkIndex: number | null;
  chunkHeading: string | null;
  chunkBodyMarkdown: string | null;
  confidence: string;
  impactLevel: number;
  createdAt: Date;
};

export type KnowledgeBlockSearchResult = {
  blockId: string;
  knowledgeSourceId: string;
  knowledgeVersionId: string;
  title: string;
  domain: string;
  knowledgeType: string;
  versionNumber: number;
  blockIndex: number;
  heading: string | null;
  bodyMarkdown: string;
  rank: number;
  status: string;
  updatedAt: Date;
  evidenceReferences: KnowledgeEvidenceReference[];
};

export type KnowledgeSourceSnapshot = {
  source: KnowledgeSource;
  version: KnowledgeVersion;
  blocks: KnowledgeBlock[];
};

export type ProposalStatus = "pending" | "approved" | "rejected";
export type NoteLinkStatus = "pending" | "approved" | "rejected";

export type UpdateProposal = {
  id: string;
  userId: string | null;
  rawNoteId: string | null;
  detectedDomain: string | null;
  detectedKnowledgeType: string | null;
  impactLevel: number;
  confidence: Confidence;
  status: ProposalStatus;
  rationale: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProposalItem = {
  id: string;
  proposalId: string;
  actionType: string;
  targetType: string | null;
  targetId: string | null;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: ProposalStatus;
  createdAt: Date;
};

export type ProposalWithItems = UpdateProposal & {
  items: ProposalItem[];
};

export type Mistake = {
  id: string;
  userId: string | null;
  domain: string;
  category: string | null;
  title: string;
  description: string;
  status: string;
  evidenceCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewTask = {
  id: string;
  userId: string | null;
  domain: string;
  title: string;
  description: string;
  status: string;
  dueAt: Date | null;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReadinessItem = {
  id: string;
  userId: string | null;
  domain: string;
  area: string;
  status: ReadinessStatus;
  rationale: string | null;
  lastEvidenceAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NoteLink = {
  id: string;
  userId: string | null;
  sourceNoteType: string;
  sourceNoteId: string;
  sourceTitle: string | null;
  targetNoteType: string;
  targetNoteId: string;
  targetTitle: string | null;
  relationType: string;
  confidence: Confidence;
  status: NoteLinkStatus;
  rationale: string | null;
  createdByAgentRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NoteCardPosition = {
  id: string;
  userId: string | null;
  boardKey: string;
  noteId: string;
  x: number;
  y: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentRun = {
  id: string;
  userId: string | null;
  runType: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type AgentRunEvent = {
  id: string;
  agentRunId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
};

export type SearchResult = {
  id: string;
  targetType: "raw_note" | "compiled_note";
  title: string | null;
  bodyMarkdown: string;
  domain: string | null;
  noteType: string | null;
  rank: number;
  createdAt: Date;
};

export type CreateKnowledgeBlockInput = {
  blockIndex: number;
  heading?: string | null;
  bodyMarkdown: string;
  tokenEstimate: number;
  metadata?: Record<string, unknown>;
};
