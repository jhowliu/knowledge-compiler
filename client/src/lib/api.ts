import { apiBaseUrl } from './constants'
import type {
  AgentRun,
  AgentRunDetail,
  AskResponse,
  CompiledNote,
  KnowledgeSearchResult,
  KnowledgeSourceTimeline,
  Proposal,
  RawSource,
  SourceIndexingTrace,
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

let workspaceDataRequest: Promise<WorkspaceData> | null = null

export async function loadWorkspaceData(): Promise<WorkspaceData> {
  if (workspaceDataRequest) {
    return workspaceDataRequest
  }

  const request = loadWorkspaceDataWithoutCache().finally(() => {
    workspaceDataRequest = null
  })
  workspaceDataRequest = request
  return request
}

async function loadWorkspaceDataWithoutCache(): Promise<WorkspaceData> {
  const [rawSources, proposals, compiledNotes, agentRuns] = await Promise.all([
    requestJson<{ rawSources: RawSource[] }>('/sources'),
    requestJson<{ proposals: Proposal[] }>('/update-proposals'),
    requestJson<{ compiledNotes: CompiledNote[] }>('/compiled-notes'),
    requestJson<{ agentRuns: AgentRun[] }>('/agent-runs'),
  ])

  return {
    rawSources: rawSources.rawSources,
    proposals: proposals.proposals,
    compiledNotes: compiledNotes.compiledNotes,
    agentRuns: agentRuns.agentRuns,
  }
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

type AskApiResponse = {
  answer: string
  citations: Array<{
    block_id: string
    title: string
    chunk_text: string
    source_note_title: string
    source_note_id: string
  }>
}

export async function askKnowledgeBase(query: string): Promise<AskResponse> {
  const result = await requestJson<AskApiResponse>('/ask', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })

  return {
    question: query,
    answer: result.answer,
    citations: result.citations.map((citation) => ({
      blockId: citation.block_id,
      title: citation.title,
      chunkText: citation.chunk_text,
      sourceNoteTitle: citation.source_note_title,
      sourceNoteId: citation.source_note_id,
    })),
  }
}
