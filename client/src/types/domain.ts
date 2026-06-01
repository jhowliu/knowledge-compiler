export type ProposalStatus = 'pending' | 'approved' | 'rejected'
export type NoteLinkStatus = 'pending' | 'approved' | 'rejected'
export type ActiveView = 'knowledge_map' | 'raw_note_editor' | 'review_maps' | 'update_proposals'
export type ThemeMode = 'light' | 'dark'
export type BoardKey = 'default' | 'algorithms' | 'review-maps'
export type RawSourceRole = 'reference' | 'personal_note'

export type DecisionRule = {
  signal: string
  recommendation: string
  confidence: string
}

export type RawNote = {
  id: string
  rawSourceId: string | null
  title: string | null
  domain: string | null
  sourceType: string
  sourceRole: RawSourceRole
  bodyMarkdown: string
  createdAt: string
}

export type RawSourceChunk = {
  id: string
  rawSourceId: string
  chunkIndex: number
  heading: string | null
  bodyMarkdown: string
  tokenEstimate: number
  metadata: Record<string, unknown>
  createdAt: string
}

export type RawSource = {
  id: string
  userId: string | null
  projectId: string | null
  folderId: string | null
  domain: string | null
  sourceType: string
  sourceRole: RawSourceRole
  title: string | null
  bodyMarkdown: string
  metadata: Record<string, unknown>
  extractedData: unknown
  createdAt: string
  updatedAt: string
  chunks: RawSourceChunk[]
}

export type SourceFolder = {
  id: string
  projectId: string
  userId: string | null
  name: string
  sourceCount: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type SourceProject = {
  id: string
  userId: string | null
  name: string
  sourceCount: number
  uncategorizedSourceCount: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  folders: SourceFolder[]
}

export type SourceOrganization = {
  projects: SourceProject[]
}

export type ProposalItem = {
  id: string
  actionType: string
  targetType: string | null
  payload: Record<string, unknown>
  rationale: string | null
  status: ProposalStatus
}

export type Proposal = {
  id: string
  rawNoteId: string | null
  detectedDomain: string | null
  detectedKnowledgeType: string | null
  impactLevel: number
  confidence: string
  status: ProposalStatus
  rationale: string | null
  items: ProposalItem[]
  createdAt: string
}

export type CompiledNote = {
  id: string
  domain: string
  noteType: string
  title: string
  bodyMarkdown: string
  structuredData?: unknown
  updatedAt: string
}

export type KnowledgeBlock = {
  id: string
  knowledgeSourceId: string
  knowledgeVersionId: string
  blockIndex: number
  heading: string | null
  bodyMarkdown: string
  tokenEstimate: number
  status: string
  createdAt: string
  updatedAt: string
}

export type KnowledgeEvidenceReference = {
  id: string
  sourceType: string
  sourceId: string
  sourceTitle: string | null
  rawSourceId: string | null
  rawSourceTitle: string | null
  rawSourceChunkId: string | null
  chunkIndex: number | null
  chunkHeading: string | null
  chunkBodyMarkdown: string | null
  confidence: string
  impactLevel: number
  createdAt: string
}

export type KnowledgeSearchResult = {
  blockId: string
  knowledgeSourceId: string
  knowledgeVersionId: string
  title: string
  domain: string
  knowledgeType: string
  versionNumber: number
  blockIndex: number
  heading: string | null
  bodyMarkdown: string
  rank: number
  status: string
  updatedAt: string
  evidenceReferences: KnowledgeEvidenceReference[]
}

export type KnowledgeSearchFilters = {
  domain: string
  knowledgeType: string
  sourceRole: 'all' | RawSourceRole
}

export type KnowledgeTimelineVersion = {
  id: string
  knowledgeSourceId: string
  compiledNoteId: string | null
  proposalId: string | null
  versionNumber: number
  title: string
  bodyMarkdown: string
  structuredData: unknown
  changeSummary: string | null
  createdAt: string
  isCurrent: boolean
  state: 'current' | 'historical'
  blocks: KnowledgeBlock[]
  evidenceReferences: KnowledgeEvidenceReference[]
}

export type KnowledgeSourceTimeline = {
  source: {
    id: string
    domain: string
    knowledgeType: string
    title: string
    status: string
    currentVersionId: string | null
    createdAt: string
    updatedAt: string
  }
  sourceEvidenceReferences: KnowledgeEvidenceReference[]
  versions: KnowledgeTimelineVersion[]
}

export type NoteLink = {
  id: string
  sourceNoteType: string
  sourceNoteId: string
  sourceTitle: string | null
  targetNoteType: string
  targetNoteId: string
  targetTitle: string | null
  relationType: string
  confidence: string
  status: NoteLinkStatus
  rationale: string | null
  createdByAgentRunId: string | null
  updatedAt: string
}

export type NoteCardPosition = {
  id: string
  boardKey: string
  noteId: string
  x: number
  y: number
  updatedAt: string
}

export type AgentRun = {
  id: string
  runType: string
  status: string
  input: unknown
  output: unknown
  error: string | null
  startedAt: string | null
  createdAt: string
  completedAt: string | null
}

export type AgentRunEvent = {
  id: string
  agentRunId: string
  eventType: string
  payload: unknown
  createdAt: string
}

export type AgentRunDetail = {
  agentRun: AgentRun | null
  events: AgentRunEvent[]
}

export type RawNoteIndexingTrace = {
  rawNote: RawNote
  status: 'Not compiled' | 'Indexing' | 'Proposed' | 'Approved' | 'Rejected' | 'Failed'
  agentRuns: AgentRun[]
  proposals: Proposal[]
  extractedData: unknown
}

export type WorkspaceData = {
  rawNotes: RawNote[]
  rawSources: RawSource[]
  sourceOrganization: SourceOrganization
  proposals: Proposal[]
  compiledNotes: CompiledNote[]
  noteLinks: NoteLink[]
  noteCardPositions: NoteCardPosition[]
  agentRuns: AgentRun[]
  reviewMaps: CompiledNote[]
}

export type RelatedNoteMatch = {
  note: CompiledNote
  score: number
  reason: string
  link?: NoteLink
}
