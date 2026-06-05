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
  RawSource,
  SourceIndexingTrace,
  SourceOrganization,
  Topic,
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
    throw new Error(await responseErrorMessage(response))
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
    throw new Error(await responseErrorMessage(response))
  }
}

async function responseErrorMessage(response: Response) {
  const body = await response.text()
  if (!body) return `Request failed with ${response.status}`

  try {
    const payload = JSON.parse(body) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // Plain-text error responses are still useful as-is.
  }

  return body
}

export function createAgentRunEventSource() {
  return new EventSource(`${apiBaseUrl}/agent-runs/stream`)
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
    rawSources,
    sourceOrganization,
    topics,
    proposals,
    compiledNotes,
    noteLinks,
    noteCardPositions,
    agentRuns,
  ] =
    await Promise.all([
      requestJson<{ rawSources: RawSource[] }>('/sources'),
      requestJson<{ sourceOrganization: SourceOrganization }>('/sources/organization'),
      requestJson<{ topics: Topic[] }>('/topics'),
      requestJson<{ proposals: Proposal[] }>('/update-proposals'),
      requestJson<{ compiledNotes: CompiledNote[] }>('/compiled-notes'),
      requestJson<{ noteLinks: NoteLink[] }>('/note-links'),
      requestJson<{ noteCardPositions: NoteCardPosition[] }>(
        `/note-card-positions?boardKey=${encodeURIComponent(graphBoardKey)}`,
      ),
      requestJson<{ agentRuns: AgentRun[] }>('/agent-runs'),
    ])

  return {
    rawSources: rawSources.rawSources,
    sourceOrganization: sourceOrganization.sourceOrganization,
    topics: topics.topics,
    proposals: proposals.proposals,
    compiledNotes: compiledNotes.compiledNotes,
    noteLinks: noteLinks.noteLinks,
    noteCardPositions: noteCardPositions.noteCardPositions,
    agentRuns: agentRuns.agentRuns,
  }
}

export async function listTopics() {
  const result = await requestJson<{ topics: Topic[] }>('/topics')
  return result.topics
}

export async function createTopic(name: string, color?: string | null) {
  const result = await requestJson<{ topic: Topic }>('/topics', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  })
  return result.topic
}

export async function updateTopic(id: string, updates: { name?: string; color?: string | null }) {
  const result = await requestJson<{ topic: Topic }>(`/topics/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return result.topic
}

export async function deleteTopic(id: string) {
  await requestVoid(`/topics/${id}`, { method: 'DELETE' })
}

export async function applySourceTopics(sourceId: string, topicIds: string[]) {
  const result = await requestJson<{ rawSource: RawSource }>(`/sources/${sourceId}/topics`, {
    method: 'PATCH',
    body: JSON.stringify({ topicIds }),
  })
  return result.rawSource
}

export async function loadSourceIndexingTrace(rawSourceId: string) {
  const result = await requestJson<{ indexingTrace: SourceIndexingTrace }>(
    `/sources/${rawSourceId}/indexing-trace`,
  )
  return result.indexingTrace
}

export async function loadAgentRunDetail(agentRunId: string) {
  const [detail, evalResult] = await Promise.all([
    requestJson<AgentRunDetail>(`/agent-runs/${agentRunId}`),
    requestJson<{ extractionEval: AgentRunDetail['extractionEval'] }>(
      `/agent-runs/${agentRunId}/eval-result`,
    ),
  ])
  return {
    ...detail,
    extractionEval: evalResult.extractionEval,
  }
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
