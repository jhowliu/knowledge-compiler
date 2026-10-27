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
import { SourceEditorPage } from './features/sources/SourceEditorPage'
import { ReviewQueuePage } from './features/review-queue/ReviewQueuePage'
import { KnowledgeSearchPanel } from './features/search/KnowledgeSearchPanel'
import {
  askKnowledgeBase,
  createAgentRunEventSource,
  loadAgentRunDetail,
  loadSourceIndexingTrace,
  loadWorkspaceData,
  requestJson,
  requestVoid,
  searchKnowledgeBlocks,
} from './lib/api'
import { emptyWorkspaceData } from './lib/constants'
import type {
  ActiveView,
  AgentRun,
  AgentRunDetail,
  AskResponse,
  KnowledgeSearchResult,
  Proposal,
  RawSource,
  RawSourceRole,
  SourceIndexingTrace,
  ThemeMode,
  WorkspaceData,
} from './types/domain'

function App() {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const selectedAgentRunIdRef = useRef<string | null>(null)
  const agentStreamRefreshTimerRef = useRef<number | null>(null)
  const [activeView, setActiveView] = useState<ActiveView>('source_editor')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  })
  const [title, setTitle] = useState('')
  const [bodyMarkdown, setBodyMarkdown] = useState('')
  const [sourceRole, setSourceRole] = useState<RawSourceRole>('personal_note')
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
  const [isSourceDirty, setIsSourceDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
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
      setLoadError(null)
      return nextData
    } catch (nextError) {
      setLoadError(nextError instanceof Error ? nextError.message : 'Unable to reach the server')
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

  async function runKnowledgeAsk(nextQuery = askQuery) {
    const trimmedQuery = nextQuery.trim()
    setIsAskOpen(true)
    setAskError(null)

    if (!trimmedQuery) {
      setAskResponse(null)
      return
    }

    setIsAskLoading(true)
    try {
      setAskResponse(await askKnowledgeBase(trimmedQuery))
    } catch (nextError) {
      setAskError(nextError instanceof Error ? nextError.message : 'Unable to ask knowledge')
      setAskResponse(null)
    } finally {
      setIsAskLoading(false)
    }
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
    document.documentElement.dataset.theme = themeMode
    try {
      window.localStorage.setItem('knowledgeCompilerTheme', themeMode)
    } catch {
      // Private windows can block storage; the theme just will not persist.
    }
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
      bodyMarkdown,
    }
  }

  async function saveSelectedSource() {
    if (!selectedSourceId) {
      return null
    }

    if (!bodyMarkdown.trim()) {
      setError('Write something in the source body first.')
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
      setError('Write something in the source body first.')
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
        setBodyMarkdown(result.rawSource.bodyMarkdown)
      }
      setNotice(
        result.agentRunId
          ? 'Source queued for indexing. Progress shows in the details panel.'
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
              setNotice('Indexing finished. Review the proposed updates.')
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
            ? 'Source kept searchable. No knowledge note was created.'
            : 'Updates applied to your knowledge.'
          : 'Proposal rejected. Your knowledge was not changed.',
      )
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update proposal')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
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
    <main className="flex h-screen min-w-[1024px] overflow-hidden bg-canvas text-ink">
      {activeView === 'source_editor' ? null : (
        <LeftNavigation
          activeView={activeView}
          agentActivitySummary={agentActivitySummary}
          onAgentActivityClick={openAgentActivityView}
          onCaptureClick={openNewSourceEditor}
          onSourcesClick={openSourcesView}
          onUpdateProposalsClick={openUpdateProposalsView}
          pendingCount={pendingCount}
        />
      )}
      <section className="flex min-w-0 flex-1 flex-col">
        {loadError ? (
          <div
            className="flex shrink-0 items-center justify-between gap-4 border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-800"
            role="alert"
          >
            <span className="min-w-0">
              Couldn&apos;t load your workspace: {loadError}
            </span>
            <button
              className="shrink-0 rounded-md border border-red-200 bg-surface px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
              onClick={() => void refresh()}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}
        {activeView !== 'source_editor' ? (
          <TopToolbar
            activeView={activeView}
            agentActivitySummary={agentActivitySummary}
            agentRunStatus={latestAgentRun?.status ?? 'idle'}
            onAgentActivityClick={openAgentActivityView}
            onAskClick={() => setIsAskOpen(true)}
            onSearchQueryChange={setSearchQuery}
            onSearchSubmit={() => void runKnowledgeSearch()}
            onThemeToggle={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
            pendingCount={pendingCount}
            searchQuery={searchQuery}
            themeMode={themeMode}
          />
        ) : null}
        {activeView === 'update_proposals' ? (
          <ReviewQueuePage
            compiledNotes={workspaceData.compiledNotes}
            error={error}
            isSubmitting={isSubmitting || isLoading}
            notice={notice}
            onApproveProposal={(proposalId, indexingOutcomeOverride) =>
              void decideProposal(proposalId, 'approve', indexingOutcomeOverride)
            }
            onRefresh={() => void refresh()}
            onRejectProposal={(proposalId) => void decideProposal(proposalId, 'reject')}
            onSelectProposal={setSelectedProposalId}
            proposals={workspaceData.proposals}
            rawSources={workspaceData.rawSources}
            selectedProposalId={selectedProposalId}
          />
        ) : activeView === 'agent_activity' ? (
          <AgentActivityPage
            agentRuns={workspaceData.agentRuns}
            error={error}
            isLoading={isLoading}
            notice={notice}
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
            isLoading={isLoading}
            isSubmitting={isSubmitting || isLoading}
            notice={notice}
            onBodyChange={updateDraftBody}
            onDelete={() => void deleteSelectedSource()}
            onAskClick={() => setIsAskOpen(true)}
            onNewNote={openNewSourceEditor}
            onOpenAgentActivity={openAgentActivityView}
            onOpenReviewQueue={openUpdateProposalsView}
            onThemeToggle={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
            onSave={() => void saveSelectedSource()}
            onSearchClick={() => setIsSearchOpen(true)}
            onSelectSource={selectSource}
            onSourceRoleChange={updateSourceRole}
            onSubmit={submitSource}
            onTitleChange={updateDraftTitle}
            proposals={workspaceData.proposals}
            rawSources={workspaceData.rawSources}
            selectedSourceId={selectedSourceId}
            sourceRole={sourceRole}
            themeMode={themeMode}
            title={title}
            titleInputRef={titleInputRef}
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
        query={askQuery}
        response={askResponse}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
