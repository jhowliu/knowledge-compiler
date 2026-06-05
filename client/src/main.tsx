import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { LeftNavigation, TopToolbar } from './components/AppShell'
import {
  AgentActivityPage,
  summarizeAgentActivity,
} from './features/agent-runs/AgentActivityCenter'
import { AgentRunDrawer } from './features/agent-runs/AgentRunDrawer'
import { AskPanel } from './features/ask/AskPanel'
import { KnowledgeCanvas } from './features/graph/KnowledgeCanvas'
import { SourceEditorPage } from './features/sources/SourceEditorPage'
import { ReviewQueuePage } from './features/review-queue/ReviewQueuePage'
import { KnowledgeSearchPanel } from './features/search/KnowledgeSearchPanel'
import {
  applySourceTopics,
  askKnowledgeBase,
  createAgentRunEventSource,
  createTopic,
  loadAgentRunDetail,
  loadSourceIndexingTrace,
  loadWorkspaceData,
  requestJson,
  requestVoid,
  searchKnowledgeBlocks,
} from './lib/api'
import { emptyWorkspaceData, graphBoardKey } from './lib/constants'
import type {
  ActiveView,
  AgentRun,
  AgentRunDetail,
  AskResponse,
  KnowledgeSearchResult,
  NoteCardPosition,
  Proposal,
  RawSource,
  RawSourceRole,
  SourceIndexingTrace,
  ThemeMode,
  Topic,
  WorkspaceData,
} from './types/domain'

function App() {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const selectedAgentRunIdRef = useRef<string | null>(null)
  const agentStreamRefreshTimerRef = useRef<number | null>(null)
  const [activeView, setActiveView] = useState<ActiveView>('knowledge_map')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedTheme = window.localStorage.getItem('knowledgeCompilerTheme')
    return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light'
  })
  const [title, setTitle] = useState('')
  const [bodyMarkdown, setBodyMarkdown] = useState('')
  const [sourceRole, setSourceRole] = useState<RawSourceRole>('personal_note')
  const [draftTopicIds, setDraftTopicIds] = useState<string[]>([])
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(emptyWorkspaceData)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [selectedSourceTrace, setSelectedSourceTrace] = useState<SourceIndexingTrace | null>(null)
  const [selectedAgentRunDetail, setSelectedAgentRunDetail] = useState<AgentRunDetail | null>(null)
  const [isAgentRunDetailLoading, setIsAgentRunDetailLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const [includeArchivedSearch, setIncludeArchivedSearch] = useState(false)
  const [askQuery, setAskQuery] = useState('')
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const [isAskOpen, setIsAskOpen] = useState(false)
  const [isAskLoading, setIsAskLoading] = useState(false)
  const [askTopicIds, setAskTopicIds] = useState<string[]>([])
  const [isSourceDirty, setIsSourceDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const pendingCount = workspaceData.proposals.filter((proposal) => proposal.status === 'pending').length
  const latestAgentRun = workspaceData.agentRuns[0] ?? null
  const agentActivitySummary = useMemo(
    () => summarizeAgentActivity(workspaceData.agentRuns, workspaceData.proposals),
    [workspaceData.agentRuns, workspaceData.proposals],
  )
  const isAgentRunning = workspaceData.agentRuns.some((agentRun) =>
    ['queued', 'running'].includes(agentRun.status),
  )

  async function refresh(options: { showLoading?: boolean } = {}) {
    const showLoading = options.showLoading ?? true
    if (showLoading) {
      setIsLoading(true)
    }
    try {
      const nextData = await loadWorkspaceData()
      setWorkspaceData(nextData)
      setError(null)
      return nextData
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load workspace')
      return null
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
    }
  }

  async function refreshSelectedSourceTrace(rawSourceId: string) {
    try {
      setSelectedSourceTrace(await loadSourceIndexingTrace(rawSourceId))
    } catch (nextError) {
      setSelectedSourceTrace(null)
      setError(nextError instanceof Error ? nextError.message : 'Unable to load indexing trace')
    }
  }

  async function openAgentRunDetail(agentRunId: string) {
    setIsAgentRunDetailLoading(true)
    setSelectedAgentRunDetail({
      agentRun: workspaceData.agentRuns.find((agentRun) => agentRun.id === agentRunId) ?? null,
      events: [],
    })
    try {
      setSelectedAgentRunDetail(await loadAgentRunDetail(agentRunId))
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load agent run')
    } finally {
      setIsAgentRunDetailLoading(false)
    }
  }

  function closeAgentRunDetail() {
    setSelectedAgentRunDetail(null)
    setIsAgentRunDetailLoading(false)
  }

  function scheduleAgentStreamRefresh(agentRunId?: string | null) {
    if (agentStreamRefreshTimerRef.current !== null) {
      return
    }

    agentStreamRefreshTimerRef.current = window.setTimeout(() => {
      agentStreamRefreshTimerRef.current = null
      void (async () => {
        await refresh({ showLoading: false })
        const selectedAgentRunId = selectedAgentRunIdRef.current
        if (!selectedAgentRunId || (agentRunId && selectedAgentRunId !== agentRunId)) {
          return
        }

        try {
          const detail = await loadAgentRunDetail(selectedAgentRunId)
          if (selectedAgentRunIdRef.current === selectedAgentRunId) {
            setSelectedAgentRunDetail(detail)
          }
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to load agent run')
        }
      })()
    }, 200)
  }

  async function runKnowledgeSearch(nextQuery = searchQuery, includeArchived = includeArchivedSearch) {
    const trimmedQuery = nextQuery.trim()
    setIsSearchOpen(true)
    setSearchError(null)

    if (!trimmedQuery) {
      setSearchResults([])
      return
    }

    setIsSearchLoading(true)
    try {
      setSearchResults(await searchKnowledgeBlocks(trimmedQuery, includeArchived))
    } catch (nextError) {
      setSearchError(nextError instanceof Error ? nextError.message : 'Unable to search knowledge')
      setSearchResults([])
    } finally {
      setIsSearchLoading(false)
    }
  }

  function updateIncludeArchivedSearch(value: boolean) {
    setIncludeArchivedSearch(value)
    if (isSearchOpen && searchQuery.trim()) {
      void runKnowledgeSearch(searchQuery, value)
    }
  }

  async function runKnowledgeAsk(nextQuery = askQuery, topicIds = askTopicIds) {
    const trimmedQuery = nextQuery.trim()
    setIsAskOpen(true)
    setAskError(null)

    if (!trimmedQuery) {
      setAskResponse(null)
      return
    }

    setIsAskLoading(true)
    try {
      setAskResponse(await askKnowledgeBase(trimmedQuery, topicIds))
    } catch (nextError) {
      setAskError(nextError instanceof Error ? nextError.message : 'Unable to ask knowledge')
      setAskResponse(null)
    } finally {
      setIsAskLoading(false)
    }
  }

  function updateAskTopicIds(topicIds: string[]) {
    setAskTopicIds(topicIds)
  }

  function openProposalFromAgentRun(proposalId: string) {
    setSelectedProposalId(proposalId)
    setActiveView('update_proposals')
    closeAgentRunDetail()
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    selectedAgentRunIdRef.current = selectedAgentRunDetail?.agentRun?.id ?? null
  }, [selectedAgentRunDetail?.agentRun?.id])

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      return undefined
    }

    const eventSource = createAgentRunEventSource()
    const onAgentRunEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { agentRunId?: unknown }
        scheduleAgentStreamRefresh(
          typeof payload.agentRunId === 'string' ? payload.agentRunId : null,
        )
      } catch {
        scheduleAgentStreamRefresh()
      }
    }

    eventSource.addEventListener('agent-run.event', onAgentRunEvent)
    return () => {
      eventSource.removeEventListener('agent-run.event', onAgentRunEvent)
      eventSource.close()
      if (agentStreamRefreshTimerRef.current !== null) {
        window.clearTimeout(agentStreamRefreshTimerRef.current)
        agentStreamRefreshTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (typeof EventSource !== 'undefined') return undefined
    if (!isAgentRunning) return undefined
    const interval = window.setInterval(() => {
      void refresh({ showLoading: false })
    }, 3000)
    return () => window.clearInterval(interval)
  }, [isAgentRunning])

  useEffect(() => {
    window.localStorage.setItem('knowledgeCompilerTheme', themeMode)
  }, [themeMode])

  useEffect(() => {
    if (activeView === 'source_editor') {
      titleInputRef.current?.focus()
    }
  }, [activeView])

  function sourcePayload() {
    return {
      title: title.trim() || null,
      sourceRole,
      sourceType: sourceRole === 'reference' ? 'paper' : 'manual',
      topicIds: draftTopicIds,
      bodyMarkdown,
    }
  }

  async function saveSelectedSource() {
    if (!selectedSourceId) {
      return null
    }

    if (!bodyMarkdown.trim()) {
      setError('Write a practice note first.')
      return null
    }

    setIsSubmitting(true)
    try {
      const result = await requestJson<{ rawSource: RawSource }>(`/sources/${selectedSourceId}`, {
        method: 'PATCH',
        body: JSON.stringify(sourcePayload()),
      })
      setSelectedSourceId(result.rawSource.id)
      setIsSourceDirty(false)
      setNotice('Source saved.')
      setError(null)
      await refresh()
      await refreshSelectedSourceTrace(result.rawSource.id)
      return result.rawSource
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save note')
      setNotice(null)
      return null
    } finally {
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedSource() {
    if (!selectedSourceId) {
      return
    }

    setIsSubmitting(true)
    try {
      await requestVoid(`/sources/${selectedSourceId}`, { method: 'DELETE' })
      setTitle('')
      setBodyMarkdown('')
      setSourceRole('personal_note')
      setDraftTopicIds([])
      setSelectedSourceId(null)
      setSelectedSourceTrace(null)
      setIsSourceDirty(false)
      setNotice('Source deleted.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to delete note')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitSource(event: React.FormEvent) {
    event.preventDefault()
    if (!bodyMarkdown.trim()) {
      setError('Write a practice note first.')
      return
    }

    setIsSubmitting(true)
    try {
      let result: { rawSource?: RawSource; proposal: Proposal | null; agentRunId?: string | null }
      const isCompilingSavedSource = Boolean(selectedSourceId)
      if (selectedSourceId) {
        if (isSourceDirty) {
          await requestJson<{ rawSource: RawSource }>(`/sources/${selectedSourceId}`, {
            method: 'PATCH',
            body: JSON.stringify(sourcePayload()),
          })
        }
        result = await requestJson<{
          rawSource?: RawSource
          proposal: Proposal | null
          agentRunId?: string | null
        }>(`/sources/${selectedSourceId}/compile`, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      } else {
        const createResult = await requestJson<{
          rawSource: RawSource
        }>('/sources', {
          method: 'POST',
          body: JSON.stringify(sourcePayload()),
        })
        const compileResult = await requestJson<{
          rawSource?: RawSource
          proposal: Proposal | null
          agentRunId?: string | null
        }>(`/sources/${createResult.rawSource.id}/compile`, {
          method: 'POST',
          body: JSON.stringify({}),
        })
        result = {
          rawSource: compileResult.rawSource ?? createResult.rawSource,
          proposal: compileResult.proposal,
          agentRunId: compileResult.agentRunId,
        }
      }
      setSelectedProposalId(result.proposal?.id ?? null)
      const nextSourceId = selectedSourceId ?? result.rawSource?.id ?? null
      setSelectedSourceId(nextSourceId)
      setIsSourceDirty(false)
      if (result.rawSource) {
        setTitle(result.rawSource.title ?? '')
        setSourceRole(result.rawSource.sourceRole)
        setDraftTopicIds(result.rawSource.topicIds)
        setBodyMarkdown(result.rawSource.bodyMarkdown)
      }
      setNotice(
        result.agentRunId
          ? 'Source queued for agentic wiki indexing. Trace is available in this editor.'
          : result.proposal
            ? isCompilingSavedSource
              ? 'Source compiled. Review the generated update proposal.'
              : 'Source captured. Review the generated update proposal.'
            : isCompilingSavedSource
              ? 'Source compiled.'
              : 'Source captured.',
      )
      setError(null)
      const refreshedData = await refresh()
      const nextProposalId =
        result.proposal?.id ??
        (nextSourceId
          ? refreshedData?.proposals.find((proposal) => proposal.rawSourceId === nextSourceId)?.id
          : null) ??
        null
      if (nextProposalId) {
        setSelectedProposalId(nextProposalId)
        setActiveView('update_proposals')
      }
      if (nextSourceId) {
        await refreshSelectedSourceTrace(nextSourceId)
        window.setTimeout(() => {
          void (async () => {
            const delayedData = await refresh()
            const delayedProposal = delayedData?.proposals.find(
              (proposal) => proposal.rawSourceId === nextSourceId,
            )
            if (delayedProposal) {
              setSelectedProposalId(delayedProposal.id)
              setActiveView('update_proposals')
              setNotice('Agent finished wiki indexing. Review the proposed incremental updates.')
            }
            await refreshSelectedSourceTrace(nextSourceId)
          })()
        }, 900)
      } else {
        setSelectedSourceTrace(null)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save note')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  function openSourcesView() {
    setActiveView('source_editor')
    setNotice(null)
    setError(null)
  }

  function openUpdateProposalsView() {
    setActiveView('update_proposals')
    setNotice(null)
    setError(null)
  }

  function openAgentActivityView() {
    setActiveView('agent_activity')
    setNotice(null)
    setError(null)
  }

  function openNewSourceEditor() {
    setTitle('')
    setBodyMarkdown('')
    setSourceRole('personal_note')
    setDraftTopicIds([])
    setSelectedSourceId(null)
    setSelectedSourceTrace(null)
    setIsSourceDirty(false)
    openSourcesView()
  }

  function selectSource(rawSource: RawSource) {
    setSelectedSourceId(rawSource.id)
    setSelectedSourceTrace(null)
    setTitle(rawSource.title ?? '')
    setSourceRole(rawSource.sourceRole)
    setDraftTopicIds(rawSource.topicIds)
    setBodyMarkdown(rawSource.bodyMarkdown)
    setIsSourceDirty(false)
    setNotice(null)
    setError(null)
    void refreshSelectedSourceTrace(rawSource.id)
  }

  function updateDraftTitle(value: string) {
    setTitle(value)
    setIsSourceDirty(true)
  }

  function updateDraftBody(value: string) {
    setBodyMarkdown(value)
    setIsSourceDirty(true)
  }

  function updateSourceRole(value: RawSourceRole) {
    setSourceRole(value)
    setIsSourceDirty(true)
  }

  function updateDraftTopicIds(topicIds: string[]) {
    setDraftTopicIds(topicIds)
    setIsSourceDirty(true)
  }

  async function createSourceProject(name: string) {
    try {
      await requestJson('/sources/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNotice(`Project "${name}" created.`)
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create project')
      setNotice(null)
    }
  }

  async function createSourceFolder(projectId: string, name: string) {
    try {
      await requestJson(`/sources/projects/${projectId}/folders`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setNotice(`Folder "${name}" created.`)
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create folder')
      setNotice(null)
    }
  }

  async function renameSourceProject(projectId: string, name: string) {
    try {
      await requestJson(`/sources/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      setNotice(`Project renamed to "${name}".`)
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to rename project')
      setNotice(null)
    }
  }

  async function renameSourceFolder(projectId: string, folderId: string, name: string) {
    try {
      await requestJson(`/sources/projects/${projectId}/folders/${folderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      setNotice(`Folder renamed to "${name}".`)
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to rename folder')
      setNotice(null)
    }
  }

  async function deleteSourceProject(projectId: string) {
    try {
      await requestVoid(`/sources/projects/${projectId}`, { method: 'DELETE' })
      setNotice('Project deleted.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to delete project')
      setNotice(null)
    }
  }

  async function deleteSourceFolder(projectId: string, folderId: string) {
    try {
      await requestVoid(`/sources/projects/${projectId}/folders/${folderId}`, { method: 'DELETE' })
      setNotice('Folder deleted.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to delete folder')
      setNotice(null)
    }
  }

  async function moveRawSource(rawSourceId: string, input: { projectId: string; folderId: string | null }) {
    try {
      await requestJson(`/sources/${rawSourceId}/organization`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
      setNotice('Source moved.')
      setError(null)
      const nextData = await refresh()
      const selectedSource = selectedSourceId
        ? nextData?.rawSources.find((source) => source.id === selectedSourceId)
        : null
      if (selectedSource) {
        setTitle(selectedSource.title ?? '')
        setSourceRole(selectedSource.sourceRole)
        setDraftTopicIds(selectedSource.topicIds)
        setBodyMarkdown(selectedSource.bodyMarkdown)
        setIsSourceDirty(false)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to move source')
      setNotice(null)
    }
  }

  async function addTopic(name: string): Promise<Topic | null> {
    try {
      const topic = await createTopic(name)
      setNotice(`Topic "${name}" created.`)
      setError(null)
      await refresh()
      return topic
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create topic')
      setNotice(null)
      return null
    }
  }

  async function applyTopicsToSource(rawSourceId: string, topicIds: string[]): Promise<RawSource | null> {
    try {
      const rawSource = await applySourceTopics(rawSourceId, topicIds)
      setDraftTopicIds(rawSource.topicIds)
      setNotice('Topics updated.')
      setError(null)
      await refresh()
      return rawSource
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update topics')
      setNotice(null)
      return null
    }
  }

  async function decideProposal(
    proposalId: string,
    decision: 'approve' | 'reject',
    indexingOutcomeOverride?: 'keep_searchable' | 'create_knowledge',
  ) {
    setIsSubmitting(true)
    try {
      const proposal = workspaceData.proposals.find((item) => item.id === proposalId)
      const recommendedKeep = proposal?.items.some((item) => item.actionType === 'keep_source_searchable') ?? false
      const keepingSourceOnly =
        decision === 'approve' &&
        (indexingOutcomeOverride === 'keep_searchable' ||
          (!indexingOutcomeOverride && recommendedKeep))
      await requestJson(`/update-proposals/${proposalId}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({ indexingOutcomeOverride: indexingOutcomeOverride ?? null }),
      })
      const nextData = await refresh()
      const nextPending = nextData?.proposals.find((proposal) => proposal.status === 'pending')
      setSelectedProposalId(nextPending?.id ?? proposalId)
      setNotice(
        decision === 'approve'
          ? keepingSourceOnly
            ? 'Source kept searchable and visible on the graph. No Knowledge Note was created.'
            : 'Updates applied to compiled knowledge. Review any new link suggestions on the right.'
          : 'Proposal rejected. No compiled knowledge was changed.',
      )
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update proposal')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function decideNoteLink(linkId: string, decision: 'approve' | 'reject') {
    try {
      await requestJson(`/note-links/${linkId}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setNotice(decision === 'approve' ? 'Note link approved.' : 'Note link rejected.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update note link')
      setNotice(null)
    }
  }

  async function createManualNoteLink(input: {
    sourceNoteId: string
    targetNoteId: string
    relationType: string
  }) {
    try {
      await requestJson('/note-links', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      setNotice('Note link added.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create note link')
      setNotice(null)
    }
  }

  async function updateManualNoteLink(linkId: string, relationType: string) {
    try {
      await requestJson(`/note-links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ relationType }),
      })
      setNotice('Note link updated.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update note link')
      setNotice(null)
    }
  }

  async function removeManualNoteLink(linkId: string) {
    try {
      await requestJson(`/note-links/${linkId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      setNotice('Note link removed.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to remove note link')
      setNotice(null)
    }
  }

  async function saveNoteCardPosition(noteId: string, position: { x: number; y: number }) {
    try {
      const result = await requestJson<{ noteCardPosition: NoteCardPosition }>(
        `/note-card-positions/${noteId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ ...position, boardKey: graphBoardKey }),
        },
      )
      setWorkspaceData((current) => ({
        ...current,
        noteCardPositions: [
          result.noteCardPosition,
          ...current.noteCardPositions.filter(
            (item) =>
              item.boardKey !== result.noteCardPosition.boardKey ||
              item.noteId !== result.noteCardPosition.noteId,
          ),
        ],
      }))
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save card position')
    }
  }

  async function resetBoardLayout() {
    try {
      await requestVoid(`/note-card-positions?boardKey=${encodeURIComponent(graphBoardKey)}`, {
        method: 'DELETE',
      })
      setWorkspaceData((current) => ({ ...current, noteCardPositions: [] }))
      setNotice('Board layout reset.')
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to reset board layout')
      setNotice(null)
    }
  }

  async function startReindexLinksRun() {
    try {
      const result = await requestJson<{ agentRun: AgentRun }>('/agent-runs', {
        method: 'POST',
        body: JSON.stringify({ runType: 'reindex_links' }),
      })
      setWorkspaceData((current) => ({
        ...current,
        agentRuns: [result.agentRun, ...current.agentRuns],
      }))
      setNotice('Agent re-index started.')
      setError(null)
      window.setTimeout(() => {
        void refresh()
      }, 900)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start agent run')
      setNotice(null)
    }
  }

  async function retryAgentRun(agentRunId: string) {
    try {
      const result = await requestJson<{ agentRun: AgentRun }>(`/agent-runs/${agentRunId}/retry`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setWorkspaceData((current) => ({
        ...current,
        agentRuns: [result.agentRun, ...current.agentRuns],
      }))
      setNotice('Agent retry started.')
      setError(null)
      await openAgentRunDetail(result.agentRun.id)
      window.setTimeout(() => {
        void refresh()
      }, 900)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to retry agent run')
      setNotice(null)
    }
  }

  return (
    <main
      className={`theme-${themeMode} flex h-screen min-w-[1180px] overflow-hidden bg-canvas text-ink`}
    >
      {activeView === 'source_editor' ? null : (
        <LeftNavigation
          activeView={activeView}
          agentActivitySummary={agentActivitySummary}
          onAgentActivityClick={openAgentActivityView}
          onCaptureClick={openNewSourceEditor}
          onKnowledgeMapClick={() => setActiveView('knowledge_map')}
          onSourcesClick={openSourcesView}
          onUpdateProposalsClick={openUpdateProposalsView}
          pendingCount={pendingCount}
          themeMode={themeMode}
        />
      )}
      <section className="flex min-w-0 flex-1 flex-col">
        {activeView !== 'source_editor' ? (
          <TopToolbar
            activeView={activeView}
            agentActivitySummary={agentActivitySummary}
            agentRunStatus={latestAgentRun?.status ?? 'idle'}
            compiledCount={workspaceData.compiledNotes.length}
            isAgentRunning={isAgentRunning}
            noteCount={workspaceData.rawSources.length}
            onAgentActivityClick={openAgentActivityView}
            onAskClick={() => setIsAskOpen(true)}
            onReindexLinks={() => void startReindexLinksRun()}
            onSearchQueryChange={setSearchQuery}
            onSearchSubmit={() => void runKnowledgeSearch()}
            onThemeToggle={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
            pendingCount={pendingCount}
            searchQuery={searchQuery}
            themeMode={themeMode}
          />
        ) : null}
        {activeView === 'knowledge_map' ? (
          <>
            {error ? (
              <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}
            <div className="relative flex min-h-0 flex-1" data-knowledge-map-panel="true">
              {notice ? (
                <div
                  aria-live="polite"
                  className="pointer-events-none absolute right-6 top-4 z-40 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50/95 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-lg"
                  role="status"
                >
                  {notice}
                </div>
              ) : null}
              <KnowledgeCanvas
                data={workspaceData}
                onCreateNoteLink={(input) => void createManualNoteLink(input)}
                onDecideNoteLink={(linkId, decision) => void decideNoteLink(linkId, decision)}
                onMoveNoteCard={(noteId, position) => void saveNoteCardPosition(noteId, position)}
                onResetBoardLayout={() => void resetBoardLayout()}
                onRemoveNoteLink={(linkId) => void removeManualNoteLink(linkId)}
                onUpdateNoteLink={(linkId, relationType) => void updateManualNoteLink(linkId, relationType)}
              />
            </div>
          </>
        ) : activeView === 'update_proposals' ? (
          <ReviewQueuePage
            compiledNotes={workspaceData.compiledNotes}
            error={error}
            isSubmitting={isSubmitting || isLoading}
            noteLinks={workspaceData.noteLinks}
            notice={notice}
            onApproveNoteLink={(linkId) => void decideNoteLink(linkId, 'approve')}
            onApproveProposal={(proposalId, indexingOutcomeOverride) =>
              void decideProposal(proposalId, 'approve', indexingOutcomeOverride)
            }
            onRefresh={() => void refresh()}
            onRejectNoteLink={(linkId) => void decideNoteLink(linkId, 'reject')}
            onRejectProposal={(proposalId) => void decideProposal(proposalId, 'reject')}
            onSelectProposal={setSelectedProposalId}
            proposals={workspaceData.proposals}
            rawSources={workspaceData.rawSources}
            selectedProposalId={selectedProposalId}
          />
        ) : activeView === 'agent_activity' ? (
          <AgentActivityPage
            agentRuns={workspaceData.agentRuns}
            onOpenProposal={openProposalFromAgentRun}
            onRetry={(agentRunId) => void retryAgentRun(agentRunId)}
            onSelectAgentRun={(agentRunId) => void openAgentRunDetail(agentRunId)}
            proposals={workspaceData.proposals}
            rawSources={workspaceData.rawSources}
          />
        ) : (
          <SourceEditorPage
            agentActivitySummary={agentActivitySummary}
            agentRuns={workspaceData.agentRuns}
            bodyMarkdown={bodyMarkdown}
            error={error}
            indexingTrace={selectedSourceTrace}
            isDirty={isSourceDirty}
            isSubmitting={isSubmitting || isLoading}
            notice={notice}
            onApplyTopics={(rawSourceId, topicIds) => void applyTopicsToSource(rawSourceId, topicIds)}
            onBodyChange={updateDraftBody}
            onCreateFolder={(projectId, name) => void createSourceFolder(projectId, name)}
            onCreateProject={(name) => void createSourceProject(name)}
            onCreateTopic={(name) => addTopic(name)}
            onDelete={() => void deleteSelectedSource()}
            onDeleteFolder={(projectId, folderId) => void deleteSourceFolder(projectId, folderId)}
            onDeleteProject={(projectId) => void deleteSourceProject(projectId)}
            onMoveSource={(rawSourceId, input) => void moveRawSource(rawSourceId, input)}
            onNewNote={openNewSourceEditor}
            onOpenAgentActivity={openAgentActivityView}
            onOpenKnowledgeMap={() => setActiveView('knowledge_map')}
            onOpenReviewQueue={openUpdateProposalsView}
            onThemeToggle={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
            onRenameFolder={(projectId, folderId, name) => void renameSourceFolder(projectId, folderId, name)}
            onRenameProject={(projectId, name) => void renameSourceProject(projectId, name)}
            onSave={() => void saveSelectedSource()}
            onSelectSource={selectSource}
            onSourceRoleChange={updateSourceRole}
            onSubmit={submitSource}
            onTitleChange={updateDraftTitle}
            onTopicIdsChange={updateDraftTopicIds}
            proposals={workspaceData.proposals}
            rawSources={workspaceData.rawSources}
            sourceProjects={workspaceData.sourceOrganization.projects}
            selectedSourceId={selectedSourceId}
            sourceRole={sourceRole}
            themeMode={themeMode}
            title={title}
            titleInputRef={titleInputRef}
            topicIds={draftTopicIds}
            topics={workspaceData.topics}
          />
        )}
      </section>
      {selectedAgentRunDetail || isAgentRunDetailLoading ? (
        <AgentRunDrawer
          data={workspaceData}
          detail={selectedAgentRunDetail}
          isLoading={isAgentRunDetailLoading}
          onClose={closeAgentRunDetail}
          onOpenProposal={openProposalFromAgentRun}
          onRetry={(agentRunId) => void retryAgentRun(agentRunId)}
        />
      ) : null}
      <KnowledgeSearchPanel
        error={searchError}
        includeArchived={includeArchivedSearch}
        isLoading={isSearchLoading}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onIncludeArchivedChange={updateIncludeArchivedSearch}
        onQueryChange={setSearchQuery}
        onSubmit={() => void runKnowledgeSearch()}
        query={searchQuery}
        results={searchResults}
      />
      <AskPanel
        error={askError}
        isLoading={isAskLoading}
        isOpen={isAskOpen}
        onClose={() => setIsAskOpen(false)}
        onQueryChange={setAskQuery}
        onSubmit={() => void runKnowledgeAsk()}
        onTopicIdsChange={updateAskTopicIds}
        query={askQuery}
        response={askResponse}
        selectedTopicIds={askTopicIds}
        topics={workspaceData.topics}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
