export type ProposalStatus = 'pending' | 'approved' | 'rejected'
export type NoteLinkStatus = 'pending' | 'approved' | 'rejected'
export type ActiveView = 'knowledge_map' | 'raw_note_editor' | 'review_maps'
export type ThemeMode = 'light' | 'dark'
export type BoardKey = 'default' | 'algorithms' | 'review-maps' | 'mistakes'

export type DecisionRule = {
  signal: string
  recommendation: string
  confidence: string
}

export type RawNote = {
  id: string
  title: string | null
  domain: string | null
  bodyMarkdown: string
  createdAt: string
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
  status: 'Not compiled' | 'Indexing' | 'Proposed' | 'Approved' | 'Rejected'
  agentRuns: AgentRun[]
  proposals: Proposal[]
  extractedData: unknown
}

export type Mistake = {
  id: string
  domain: string
  category: string | null
  title: string
  description: string
  evidenceCount: number
}

export type ReviewTask = {
  id: string
  domain: string
  title: string
  description: string
  status: string
}

export type ReadinessItem = {
  id: string
  domain: string
  area: string
  status: string
  rationale: string | null
}

export type WorkspaceData = {
  rawNotes: RawNote[]
  proposals: Proposal[]
  compiledNotes: CompiledNote[]
  noteLinks: NoteLink[]
  noteCardPositions: NoteCardPosition[]
  agentRuns: AgentRun[]
  reviewMaps: CompiledNote[]
  mistakes: Mistake[]
  reviewTasks: ReviewTask[]
  readinessItems: ReadinessItem[]
}

export type RelatedNoteMatch = {
  note: CompiledNote
  score: number
  reason: string
  link?: NoteLink
}
