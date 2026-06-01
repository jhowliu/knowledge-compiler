import { apiBaseUrl, graphBoardKey } from './constants'
import type {
  AgentRun,
  AgentRunDetail,
  CompiledNote,
  KnowledgeSearchResult,
  KnowledgeSourceTimeline,
  NoteCardPosition,
  NoteLink,
  Proposal,
  RawNote,
  RawNoteIndexingTrace,
  RawSource,
  SourceOrganization,
  WorkspaceData,
} from '../types/domain'

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
  }
}

const workspaceDataRequests = new Map<string, Promise<WorkspaceData>>()

export async function loadWorkspaceData(): Promise<WorkspaceData> {
  const inFlightRequest = workspaceDataRequests.get(graphBoardKey)
  if (inFlightRequest) {
    return inFlightRequest
  }

  const request = loadWorkspaceDataWithoutCache().finally(() => {
    workspaceDataRequests.delete(graphBoardKey)
  })
  workspaceDataRequests.set(graphBoardKey, request)
  return request
}

async function loadWorkspaceDataWithoutCache(): Promise<WorkspaceData> {
  const [
    rawNotes,
    rawSources,
    sourceOrganization,
    proposals,
    compiledNotes,
    noteLinks,
    noteCardPositions,
    agentRuns,
  ] =
    await Promise.all([
      requestJson<{ rawNotes: RawNote[] }>('/raw-notes'),
      requestJson<{ rawSources: RawSource[] }>('/sources'),
      requestJson<{ sourceOrganization: SourceOrganization }>('/sources/organization'),
      requestJson<{ proposals: Proposal[] }>('/update-proposals'),
      requestJson<{ compiledNotes: CompiledNote[] }>('/compiled-notes'),
      requestJson<{ noteLinks: NoteLink[] }>('/note-links'),
      requestJson<{ noteCardPositions: NoteCardPosition[] }>(
        `/note-card-positions?boardKey=${encodeURIComponent(graphBoardKey)}`,
      ),
      requestJson<{ agentRuns: AgentRun[] }>('/agent-runs'),
    ])

  return {
    rawNotes: rawNotes.rawNotes,
    rawSources: rawSources.rawSources,
    sourceOrganization: sourceOrganization.sourceOrganization,
    proposals: proposals.proposals,
    compiledNotes: compiledNotes.compiledNotes,
    noteLinks: noteLinks.noteLinks,
    noteCardPositions: noteCardPositions.noteCardPositions,
    agentRuns: agentRuns.agentRuns,
  }
}

export async function loadRawNoteIndexingTrace(rawNoteId: string) {
  const result = await requestJson<{ indexingTrace: RawNoteIndexingTrace }>(
    `/raw-notes/${rawNoteId}/indexing-trace`,
  )
  return result.indexingTrace
}

export async function loadAgentRunDetail(agentRunId: string) {
  return requestJson<AgentRunDetail>(`/agent-runs/${agentRunId}`)
}

export async function loadKnowledgeTimelineForCompiledNote(compiledNoteId: string) {
  const result = await requestJson<{ timeline: KnowledgeSourceTimeline }>(
    `/compiled-notes/${compiledNoteId}/timeline`,
  )
  return result.timeline
}

export async function loadKnowledgeSourceTimeline(knowledgeSourceId: string) {
  const result = await requestJson<{ timeline: KnowledgeSourceTimeline }>(
    `/knowledge-sources/${knowledgeSourceId}/timeline`,
  )
  return result.timeline
}

export async function searchKnowledgeBlocks(query: string, includeArchived: boolean) {
  const params = new URLSearchParams({ q: query })
  if (includeArchived) {
    params.set('includeArchived', 'true')
  }

  const result = await requestJson<{ results: KnowledgeSearchResult[] }>(
    `/search?${params.toString()}`,
  )
  return result.results
}
