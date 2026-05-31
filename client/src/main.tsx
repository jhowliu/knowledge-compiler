import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { LeftNavigation, TopToolbar } from './components/AppShell'
import { AgentRunDrawer } from './features/agent-runs/AgentRunDrawer'
import { KnowledgeCanvas } from './features/graph/KnowledgeCanvas'
import { RawNoteEditorPage } from './features/raw-notes/RawNoteEditorPage'
import { ReviewQueuePage } from './features/review-queue/ReviewQueuePage'
import { ReviewMapsPage } from './features/review-maps/ReviewMapsPage'
import { KnowledgeSearchPanel } from './features/search/KnowledgeSearchPanel'
import {
  loadAgentRunDetail,
  loadRawNoteIndexingTrace,
  loadWorkspaceData,
  requestJson,
  requestVoid,
  searchKnowledgeBlocks,
} from './lib/api'
import { boardOptions, emptyWorkspaceData } from './lib/constants'
import type {
  ActiveView,
  AgentRun,
  AgentRunDetail,
  BoardKey,
  KnowledgeSearchResult,
  NoteCardPosition,
  Proposal,
  RawNote,
  RawNoteIndexingTrace,
  RawSourceRole,
  ThemeMode,
  WorkspaceData,
} from './types/domain'

function App() {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [activeView, setActiveView] = useState<ActiveView>('knowledge_map')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedTheme = window.localStorage.getItem('knowledgeCompilerTheme')
    return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light'
  })
  const [activeBoardKey, setActiveBoardKey] = useState<BoardKey>(() => {
    const savedBoardKey = window.localStorage.getItem('knowledgeCompilerBoardKey')
    return boardOptions.some((board) => board.key === savedBoardKey)
      ? (savedBoardKey as BoardKey)
      : 'default'
  })
  const [title, setTitle] = useState('')
  const [bodyMarkdown, setBodyMarkdown] = useState('')
  const [sourceRole, setSourceRole] = useState<RawSourceRole>('personal_note')
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(emptyWorkspaceData)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [selectedRawNoteId, setSelectedRawNoteId] = useState<string | null>(null)
  const [selectedRawNoteTrace, setSelectedRawNoteTrace] = useState<RawNoteIndexingTrace | null>(null)
  const [selectedAgentRunDetail, setSelectedAgentRunDetail] = useState<AgentRunDetail | null>(null)
  const [isAgentRunDetailLoading, setIsAgentRunDetailLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const [includeArchivedSearch, setIncludeArchivedSearch] = useState(false)
  const [isRawNoteDirty, setIsRawNoteDirty] = useState(false)
  const [selectedReviewMapId, setSelectedReviewMapId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedProposal = useMemo(() => {
    return (
      workspaceData.proposals.find((proposal) => proposal.id === selectedProposalId) ??
      workspaceData.proposals.find((proposal) => proposal.status === 'pending') ??
      workspaceData.proposals[0] ??
      null
    )
  }, [selectedProposalId, workspaceData.proposals])

  const pendingCount = workspaceData.proposals.filter((proposal) => proposal.status === 'pending').length
  const latestAgentRun = workspaceData.agentRuns[0] ?? null
  const isAgentRunning = workspaceData.agentRuns.some((agentRun) =>
    ['queued', 'running'].includes(agentRun.status),
  )

  async function refresh() {
    setIsLoading(true)
    try {
      const nextData = await loadWorkspaceData(activeBoardKey)
      setWorkspaceData(nextData)
      setError(null)
      return nextData
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load workspace')
      return null
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshSelectedRawNoteTrace(rawNoteId: string) {
    try {
      setSelectedRawNoteTrace(await loadRawNoteIndexingTrace(rawNoteId))
    } catch (nextError) {
      setSelectedRawNoteTrace(null)
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

  function openProposalFromAgentRun(proposalId: string) {
    setSelectedProposalId(proposalId)
    setActiveView('update_proposals')
    closeAgentRunDetail()
  }

  useEffect(() => {
    void refresh()
  }, [activeBoardKey])

  useEffect(() => {
    window.localStorage.setItem('knowledgeCompilerTheme', themeMode)
  }, [themeMode])

  useEffect(() => {
    window.localStorage.setItem('knowledgeCompilerBoardKey', activeBoardKey)
  }, [activeBoardKey])

  useEffect(() => {
    if (activeView === 'raw_note_editor') {
      titleInputRef.current?.focus()
    }
  }, [activeView])

  useEffect(() => {
    if (!selectedReviewMapId && workspaceData.reviewMaps.length > 0) {
      setSelectedReviewMapId(workspaceData.reviewMaps[0].id)
      return
    }

    if (
      selectedReviewMapId &&
      workspaceData.reviewMaps.length > 0 &&
      !workspaceData.reviewMaps.some((reviewMap) => reviewMap.id === selectedReviewMapId)
    ) {
      setSelectedReviewMapId(workspaceData.reviewMaps[0].id)
    }
  }, [selectedReviewMapId, workspaceData.reviewMaps])

  function rawNotePayload() {
    return {
      title: title.trim() || null,
      sourceRole,
      sourceType: sourceRole === 'reference' ? 'paper' : 'manual',
      bodyMarkdown,
    }
  }

  async function saveSelectedRawNote() {
    if (!selectedRawNoteId) {
      return null
    }

    if (!bodyMarkdown.trim()) {
      setError('Write a practice note first.')
      return null
    }

    setIsSubmitting(true)
    try {
      const result = await requestJson<{ rawNote: RawNote }>(`/raw-notes/${selectedRawNoteId}`, {
        method: 'PATCH',
        body: JSON.stringify(rawNotePayload()),
      })
      setSelectedRawNoteId(result.rawNote.id)
      setIsRawNoteDirty(false)
      setNotice('Raw note saved.')
      setError(null)
      await refresh()
      await refreshSelectedRawNoteTrace(result.rawNote.id)
      return result.rawNote
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save note')
      setNotice(null)
      return null
    } finally {
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedRawNote() {
    if (!selectedRawNoteId) {
      return
    }

    setIsSubmitting(true)
    try {
      await requestVoid(`/raw-notes/${selectedRawNoteId}`, { method: 'DELETE' })
      setTitle('')
      setBodyMarkdown('')
      setSourceRole('personal_note')
      setSelectedRawNoteId(null)
      setSelectedRawNoteTrace(null)
      setIsRawNoteDirty(false)
      setNotice('Raw note deleted.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to delete note')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitRawNote(event: React.FormEvent) {
    event.preventDefault()
    if (!bodyMarkdown.trim()) {
      setError('Write a practice note first.')
      return
    }

    setIsSubmitting(true)
    try {
      let result: { rawNote?: RawNote; proposal: Proposal | null; agentRunId?: string | null }
      const isCompilingSavedNote = Boolean(selectedRawNoteId)
      if (selectedRawNoteId) {
        const selectedRawNote = workspaceData.rawNotes.find((note) => note.id === selectedRawNoteId)
        if (isRawNoteDirty) {
          await requestJson<{ rawNote: RawNote }>(`/raw-notes/${selectedRawNoteId}`, {
            method: 'PATCH',
            body: JSON.stringify(rawNotePayload()),
          })
        }
        result = await requestJson<{
          rawNote?: RawNote
          proposal: Proposal | null
          agentRunId?: string | null
        }>(
          selectedRawNote?.rawSourceId
            ? `/sources/${selectedRawNote.rawSourceId}/compile`
            : `/raw-notes/${selectedRawNoteId}/compile`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          },
        )
      } else {
        result = await requestJson<{
          rawNote: RawNote
          proposal: Proposal | null
          agentRunId?: string | null
        }>('/raw-notes', {
          method: 'POST',
          body: JSON.stringify(rawNotePayload()),
        })
      }
      setSelectedProposalId(result.proposal?.id ?? null)
      const nextRawNoteId = selectedRawNoteId ?? result.rawNote?.id ?? null
      setSelectedRawNoteId(nextRawNoteId)
      setIsRawNoteDirty(false)
      if (result.rawNote) {
        setTitle(result.rawNote.title ?? '')
        setSourceRole(result.rawNote.sourceRole)
        setBodyMarkdown(result.rawNote.bodyMarkdown)
      }
      setNotice(
        result.agentRunId
          ? 'Raw note queued for agentic wiki indexing. Trace is available in this editor.'
          : result.proposal
            ? isCompilingSavedNote
              ? 'Raw note compiled. Review the generated update proposal.'
              : 'Raw note captured. Review the generated update proposal.'
            : isCompilingSavedNote
              ? 'Raw note compiled.'
              : 'Raw note captured.',
      )
      setError(null)
      const refreshedData = await refresh()
      const nextProposalId =
        result.proposal?.id ??
        (nextRawNoteId
          ? refreshedData?.proposals.find((proposal) => proposal.rawNoteId === nextRawNoteId)?.id
          : null) ??
        null
      if (nextProposalId) {
        setSelectedProposalId(nextProposalId)
        setActiveView('update_proposals')
      }
      if (nextRawNoteId) {
        await refreshSelectedRawNoteTrace(nextRawNoteId)
        window.setTimeout(() => {
          void (async () => {
            const delayedData = await refresh()
            const delayedProposal = delayedData?.proposals.find(
              (proposal) => proposal.rawNoteId === nextRawNoteId,
            )
            if (delayedProposal) {
              setSelectedProposalId(delayedProposal.id)
              setActiveView('update_proposals')
              setNotice('Agent finished wiki indexing. Review the proposed incremental updates.')
            }
            await refreshSelectedRawNoteTrace(nextRawNoteId)
          })()
        }, 900)
      } else {
        setSelectedRawNoteTrace(null)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save note')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  function openRawNotesView() {
    setActiveView('raw_note_editor')
    setNotice(null)
    setError(null)
  }

  function openReviewMapsView() {
    setActiveView('review_maps')
    setNotice(null)
    setError(null)
  }

  function openUpdateProposalsView() {
    setActiveView('update_proposals')
    setNotice(null)
    setError(null)
  }

  function openNewRawNoteEditor() {
    setTitle('')
    setBodyMarkdown('')
    setSourceRole('personal_note')
    setSelectedRawNoteId(null)
    setSelectedRawNoteTrace(null)
    setIsRawNoteDirty(false)
    openRawNotesView()
  }

  function selectRawNote(rawNote: RawNote) {
    setSelectedRawNoteId(rawNote.id)
    setSelectedRawNoteTrace(null)
    setTitle(rawNote.title ?? '')
    setSourceRole(rawNote.sourceRole)
    setBodyMarkdown(rawNote.bodyMarkdown)
    setIsRawNoteDirty(false)
    setNotice(null)
    setError(null)
    void refreshSelectedRawNoteTrace(rawNote.id)
  }

  function updateDraftTitle(value: string) {
    setTitle(value)
    setIsRawNoteDirty(true)
  }

  function updateDraftBody(value: string) {
    setBodyMarkdown(value)
    setIsRawNoteDirty(true)
  }

  function updateSourceRole(value: RawSourceRole) {
    setSourceRole(value)
    setIsRawNoteDirty(true)
  }

  async function decideProposal(proposalId: string, decision: 'approve' | 'reject') {
    setIsSubmitting(true)
    try {
      await requestJson(`/update-proposals/${proposalId}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const nextData = await refresh()
      const nextPending = nextData?.proposals.find((proposal) => proposal.status === 'pending')
      setSelectedProposalId(nextPending?.id ?? proposalId)
      setNotice(
        decision === 'approve'
          ? 'Updates applied to compiled knowledge. Review any new link suggestions on the right.'
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
          body: JSON.stringify({ ...position, boardKey: activeBoardKey }),
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
      await requestVoid(`/note-card-positions?boardKey=${encodeURIComponent(activeBoardKey)}`, {
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
      <LeftNavigation
        activeView={activeView}
        onCaptureClick={openNewRawNoteEditor}
        onKnowledgeMapClick={() => setActiveView('knowledge_map')}
        onRawNotesClick={openRawNotesView}
        onReviewMapsClick={openReviewMapsView}
        onUpdateProposalsClick={openUpdateProposalsView}
        onThemeToggle={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
        pendingCount={pendingCount}
        reviewMapCount={workspaceData.reviewMaps.length}
        themeMode={themeMode}
      />
      <section className="flex min-w-0 flex-1 flex-col">
        {activeView === 'knowledge_map' ? (
          <>
            <TopToolbar
              agentRunStatus={latestAgentRun?.status ?? 'idle'}
              compiledCount={workspaceData.compiledNotes.length}
              isAgentRunning={isAgentRunning}
              noteCount={workspaceData.rawSources.length || workspaceData.rawNotes.length}
              onReindexLinks={() => void startReindexLinksRun()}
              onSearchQueryChange={setSearchQuery}
              onSearchSubmit={() => void runKnowledgeSearch()}
              searchQuery={searchQuery}
            />
            {error ? (
              <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="mx-6 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {notice}
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1">
              <KnowledgeCanvas
                activeBoardKey={activeBoardKey}
                data={workspaceData}
                onBoardChange={setActiveBoardKey}
                onCreateNoteLink={(input) => void createManualNoteLink(input)}
                onDecideNoteLink={(linkId, decision) => void decideNoteLink(linkId, decision)}
                onMoveNoteCard={(noteId, position) => void saveNoteCardPosition(noteId, position)}
                onResetBoardLayout={() => void resetBoardLayout()}
                onRemoveNoteLink={(linkId) => void removeManualNoteLink(linkId)}
                onSelectAgentRun={(agentRunId) => void openAgentRunDetail(agentRunId)}
                onUpdateNoteLink={(linkId, relationType) => void updateManualNoteLink(linkId, relationType)}
              />
            </div>
          </>
        ) : activeView === 'review_maps' ? (
          <ReviewMapsPage
            compiledNotes={workspaceData.compiledNotes}
            onSelectReviewMap={setSelectedReviewMapId}
            rawNotes={workspaceData.rawNotes}
            reviewMaps={workspaceData.reviewMaps}
            selectedReviewMapId={selectedReviewMapId}
          />
        ) : activeView === 'update_proposals' ? (
          <ReviewQueuePage
            error={error}
            isSubmitting={isSubmitting || isLoading}
            noteLinks={workspaceData.noteLinks}
            notice={notice}
            onApproveNoteLink={(linkId) => void decideNoteLink(linkId, 'approve')}
            onApproveProposal={(proposalId) => void decideProposal(proposalId, 'approve')}
            onRefresh={() => void refresh()}
            onRejectNoteLink={(linkId) => void decideNoteLink(linkId, 'reject')}
            onRejectProposal={(proposalId) => void decideProposal(proposalId, 'reject')}
            onSelectProposal={setSelectedProposalId}
            proposals={workspaceData.proposals}
            rawNotes={workspaceData.rawNotes}
            rawSources={workspaceData.rawSources}
            selectedProposalId={selectedProposal?.id ?? null}
          />
        ) : (
          <RawNoteEditorPage
            agentRuns={workspaceData.agentRuns}
            bodyMarkdown={bodyMarkdown}
            error={error}
            indexingTrace={selectedRawNoteTrace}
            isDirty={isRawNoteDirty}
            isSubmitting={isSubmitting || isLoading}
            notice={notice}
            onBodyChange={updateDraftBody}
            onDelete={() => void deleteSelectedRawNote()}
            onNewNote={openNewRawNoteEditor}
            onSave={() => void saveSelectedRawNote()}
            onSelectRawNote={selectRawNote}
            onSourceRoleChange={updateSourceRole}
            onSubmit={submitRawNote}
            onTitleChange={updateDraftTitle}
            proposals={workspaceData.proposals}
            rawNotes={workspaceData.rawNotes}
            rawSources={workspaceData.rawSources}
            selectedRawNoteId={selectedRawNoteId}
            sourceRole={sourceRole}
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
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
