import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Eye,
  FileText,
  PanelRight,
  PencilLine,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { PrimaryNavigation, ThemeToggle, agentAttentionCount } from '../../components/AppShell'
import { MarkdownPreview } from '../../components/MarkdownPreview'
import { Banner, IconButton, Pill, pluralize, type Tone } from '../../components/ui'
import type { AgentActivitySummary } from '../agent-runs/AgentActivityCenter'
import type {
  AgentRun,
  Proposal,
  RawSource,
  RawSourceRole,
  SourceIndexingTrace,
  ThemeMode,
} from '../../types/domain'

type SourceLifecycle = {
  label: string
  tone: 'idle' | 'active' | 'pending' | 'done' | 'failed'
}

type RoleFilter = 'all' | RawSourceRole
type LifecycleFilter = 'all' | SourceLifecycle['tone']

function getRunSourceId(agentRun: AgentRun) {
  if (!agentRun.input || typeof agentRun.input !== 'object') {
    return null
  }

  const input = agentRun.input as { rawSourceId?: unknown }
  return typeof input.rawSourceId === 'string' ? input.rawSourceId : null
}

function getLifecycle(source: RawSource, proposals: Proposal[], agentRuns: AgentRun[]): SourceLifecycle {
  const sourceProposals = proposals.filter((proposal) => proposal.rawSourceId === source.id)
  const sourceRuns = agentRuns.filter((agentRun) => getRunSourceId(agentRun) === source.id)
  const hasActiveRun = sourceRuns.some((agentRun) => ['queued', 'running'].includes(agentRun.status))
  const latestProposal = sourceProposals[0] ?? null
  const latestFailedRun = sourceRuns.find((agentRun) => agentRun.status === 'failed')

  if (hasActiveRun) {
    return { label: 'Indexing', tone: 'active' }
  }

  if (latestFailedRun && !latestProposal) {
    return { label: 'Failed', tone: 'failed' }
  }

  if (latestProposal?.status === 'approved') {
    return { label: 'Applied', tone: 'done' }
  }

  if (latestProposal?.status === 'rejected') {
    return { label: 'Rejected', tone: 'failed' }
  }

  if (latestProposal?.status === 'pending') {
    return { label: 'Needs approval', tone: 'pending' }
  }

  return { label: 'Captured', tone: 'idle' }
}

const lifecycleTone: Record<SourceLifecycle['tone'], Tone> = {
  idle: 'neutral',
  active: 'accent',
  pending: 'warning',
  done: 'success',
  failed: 'danger',
}

function roleLabel(role: RawSourceRole) {
  return role === 'reference' ? 'Reference' : 'Personal note'
}

function sourceTypeLabel(sourceType: string) {
  const label = sourceType.replaceAll('_', ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function sourceTitle(source: RawSource | null | undefined) {
  return source?.title ?? 'Untitled source'
}

function formatDate(value: string | undefined) {
  if (!value) return 'Draft'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function SourceSidebarItem({
  isSelected,
  lifecycle,
  onSelect,
  source,
}: {
  isSelected: boolean
  lifecycle: SourceLifecycle
  onSelect: () => void
  source: RawSource
}) {
  return (
    <button
      aria-current={isSelected ? 'true' : undefined}
      className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
        isSelected
          ? 'border-violet bg-violet/10'
          : 'border-transparent hover:border-gray-200 hover:bg-slate-50'
      }`}
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-gray-200 bg-surface text-gray-500">
          {source.sourceRole === 'reference' ? (
            <BookOpen aria-hidden size={13} />
          ) : (
            <FileText aria-hidden size={13} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold leading-5 text-ink">
            {sourceTitle(source)}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2">
            <span className="text-xs font-medium text-gray-500">{formatDate(source.updatedAt)}</span>
            <Pill tone={lifecycleTone[lifecycle.tone]}>{lifecycle.label}</Pill>
          </span>
        </span>
      </span>
    </button>
  )
}

const filterSelect =
  'h-8 min-w-0 flex-1 rounded-md border border-gray-300 bg-surface px-2 text-xs font-semibold text-ink'

const headerButton =
  'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50'

export function SourceEditorPage({
  indexingTrace,
  rawSources,
  proposals,
  agentRuns,
  selectedSourceId,
  isDirty,
  title,
  sourceRole,
  bodyMarkdown,
  isLoading,
  isSubmitting,
  notice,
  error,
  themeMode,
  titleInputRef,
  onTitleChange,
  onBodyChange,
  onSourceRoleChange,
  onAskClick,
  onSearchClick,
  onNewNote,
  onSelectSource,
  onSave,
  onDelete,
  onSubmit,
  onOpenAgentActivity,
  onOpenReviewQueue,
  onThemeToggle,
  agentActivitySummary,
}: {
  indexingTrace: SourceIndexingTrace | null
  rawSources: RawSource[]
  proposals: Proposal[]
  agentRuns: AgentRun[]
  selectedSourceId: string | null
  isDirty: boolean
  title: string
  sourceRole: RawSourceRole
  bodyMarkdown: string
  isLoading: boolean
  isSubmitting: boolean
  notice: string | null
  error: string | null
  themeMode: ThemeMode
  titleInputRef: React.RefObject<HTMLInputElement | null>
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onSourceRoleChange: (value: RawSourceRole) => void
  onAskClick: () => void
  onSearchClick: () => void
  onNewNote: () => void
  onSelectSource: (source: RawSource) => void
  onSave: () => void
  onDelete: () => void
  onSubmit: (event: React.FormEvent) => void
  onOpenAgentActivity: () => void
  onOpenReviewQueue: () => void
  onThemeToggle: () => void
  agentActivitySummary: AgentActivitySummary
}) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('all')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const selectedSource = rawSources.find((source) => source.id === selectedSourceId) ?? null
  const selectedChunks = selectedSource?.chunks ?? []
  const selectedLifecycle = selectedSource
    ? getLifecycle(selectedSource, proposals, agentRuns)
    : { label: 'Draft', tone: 'idle' as const }
  const pendingCount = proposals.filter((proposal) => proposal.status === 'pending').length
  const sourceRows = useMemo(() => {
    return rawSources.map((source) => {
      const lifecycle = getLifecycle(source, proposals, agentRuns)
      return { lifecycle, source }
    })
  }, [agentRuns, proposals, rawSources])

  const filteredSourceRows = sourceRows.filter(({ lifecycle, source }) => {
    const matchesRole = roleFilter === 'all' || source.sourceRole === roleFilter
    const matchesLifecycle = lifecycleFilter === 'all' || lifecycle.tone === lifecycleFilter
    return matchesRole && matchesLifecycle
  })
  const hasActiveFilter = roleFilter !== 'all' || lifecycleFilter !== 'all'

  const activeProposal = indexingTrace?.proposals[0] ?? null

  useEffect(() => {
    setIsConfirmingDelete(false)
  }, [selectedSourceId])

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] bg-canvas text-ink">
      <aside className="flex min-h-0 flex-col gap-[18px] overflow-hidden border-r border-gray-200 bg-surface px-[18px] py-6">
        <PrimaryNavigation
          activeView="source_editor"
          agentActivitySummary={agentActivitySummary}
          onAgentActivityClick={onOpenAgentActivity}
          onCaptureClick={onNewNote}
          onSourcesClick={() => undefined}
          onUpdateProposalsClick={onOpenReviewQueue}
          pendingCount={pendingCount}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-2">
            <h2 className="text-xs font-bold text-gray-600">All sources</h2>
            <span className="text-xs font-semibold tabular-nums text-gray-500">
              {hasActiveFilter
                ? `${filteredSourceRows.length} of ${rawSources.length}`
                : rawSources.length}
            </span>
          </div>

          <div className="mt-2 flex shrink-0 gap-2">
            <select
              aria-label="Filter sources by role"
              className={filterSelect}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              value={roleFilter}
            >
              <option value="all">All roles</option>
              <option value="personal_note">Personal</option>
              <option value="reference">Reference</option>
            </select>
            <select
              aria-label="Filter sources by status"
              className={filterSelect}
              onChange={(event) => setLifecycleFilter(event.target.value as LifecycleFilter)}
              value={lifecycleFilter}
            >
              <option value="all">All states</option>
              <option value="idle">Captured</option>
              <option value="active">Indexing</option>
              <option value="pending">Needs approval</option>
              <option value="done">Applied</option>
              <option value="failed">Failed / rejected</option>
            </select>
          </div>

          <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {filteredSourceRows.map(({ lifecycle, source }) => (
              <SourceSidebarItem
                isSelected={source.id === selectedSourceId}
                key={source.id}
                lifecycle={lifecycle}
                onSelect={() => onSelectSource(source)}
                source={source}
              />
            ))}
            {!filteredSourceRows.length ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-3 py-5 text-center">
                {isLoading && !rawSources.length ? (
                  <p className="text-xs text-gray-600">Loading sources…</p>
                ) : rawSources.length ? (
                  <>
                    <p className="text-xs leading-5 text-gray-600">No sources match these filters.</p>
                    <button
                      className="mt-2 text-xs font-bold text-accent hover:underline"
                      onClick={() => {
                        setRoleFilter('all')
                        setLifecycleFilter('all')
                      }}
                      type="button"
                    >
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-ink">No sources yet</p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      Capture a note or paste a reference to get started.
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-gray-300 bg-surface px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold text-ink">Sources</h1>
            <p className="truncate text-xs text-gray-500">
              {rawSources.length
                ? `${pluralize(rawSources.length, 'source')} captured.`
                : 'Capture evidence and index reusable knowledge.'}
            </p>
          </div>
          <IconButton label="Search knowledge" onClick={onSearchClick}>
            <Search aria-hidden size={18} />
          </IconButton>
          <IconButton label="Ask knowledge base" onClick={onAskClick}>
            <Bot aria-hidden size={18} />
          </IconButton>
          <IconButton
            badge={agentAttentionCount(agentActivitySummary)}
            label="Open agent activity"
            onClick={onOpenAgentActivity}
          >
            <Activity aria-hidden size={18} />
          </IconButton>
          <ThemeToggle onClick={onThemeToggle} themeMode={themeMode} />
        </header>

        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_264px]">
          <form className="flex min-h-0 min-w-0 flex-col bg-surface" onSubmit={onSubmit}>
            <header className="shrink-0 border-b border-gray-200 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate text-sm font-bold text-ink">
                  {selectedSource ? sourceTitle(selectedSource) : 'New source'}
                </p>
                <Pill tone={lifecycleTone[selectedLifecycle.tone]}>
                  {indexingTrace?.status ?? selectedLifecycle.label}
                </Pill>
                {isDirty ? (
                  <span className="shrink-0 text-xs font-semibold text-amber-800">Unsaved changes</span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div
                  aria-label="Source role"
                  className="flex h-9 rounded-lg border border-gray-200 bg-slate-50 p-1"
                  role="group"
                >
                  {[
                    { value: 'personal_note' as const, label: 'Personal', icon: PencilLine },
                    { value: 'reference' as const, label: 'Reference', icon: BookOpen },
                  ].map((option) => {
                    const Icon = option.icon
                    return (
                      <button
                        aria-pressed={sourceRole === option.value}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 text-xs font-bold transition-colors ${
                          sourceRole === option.value
                            ? 'bg-surface text-ink shadow-sm'
                            : 'text-gray-600 hover:text-ink'
                        }`}
                        key={option.value}
                        onClick={() => onSourceRoleChange(option.value)}
                        type="button"
                      >
                        <Icon aria-hidden size={14} />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  aria-pressed={isPreviewOpen}
                  className={`${headerButton} border-gray-300 bg-surface text-gray-600 hover:bg-slate-50 hover:text-ink`}
                  onClick={() => setIsPreviewOpen((current) => !current)}
                  title={isPreviewOpen ? 'Hide preview' : 'Show preview'}
                  type="button"
                >
                  {isPreviewOpen ? (
                    <PanelRight aria-hidden size={15} />
                  ) : (
                    <Eye aria-hidden size={15} />
                  )}
                  Preview
                </button>

                <span className="flex-1" />

                {selectedSource ? (
                  <>
                    {isConfirmingDelete ? (
                      <>
                        <button
                          className={`${headerButton} border-gray-300 bg-surface text-ink hover:bg-slate-50`}
                          onClick={() => setIsConfirmingDelete(false)}
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className={`${headerButton} border-red-600 bg-red-600 text-white hover:bg-red-700`}
                          disabled={isSubmitting}
                          onClick={onDelete}
                          type="button"
                        >
                          <Trash2 aria-hidden size={14} />
                          Delete source
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`${headerButton} border-gray-300 bg-surface text-ink hover:bg-slate-50`}
                          disabled={isSubmitting || !isDirty}
                          onClick={onSave}
                          type="button"
                        >
                          <Save aria-hidden size={14} />
                          Save
                        </button>
                        <button
                          aria-label="Delete source"
                          className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-surface text-red-600 hover:bg-red-50 disabled:opacity-50"
                          disabled={isSubmitting}
                          onClick={() => setIsConfirmingDelete(true)}
                          title="Delete source"
                          type="button"
                        >
                          <Trash2 aria-hidden size={15} />
                        </button>
                      </>
                    )}
                  </>
                ) : null}
                <button
                  className={`${headerButton} border-violet bg-violet text-white hover:bg-violet-dark`}
                  disabled={isSubmitting}
                  type="submit"
                >
                  <Sparkles aria-hidden size={14} />
                  {isSubmitting ? 'Indexing…' : selectedSource ? 'Index source' : 'Save & index'}
                </button>
              </div>
            </header>

            {error || notice ? (
              <div className="mx-5 mt-4 space-y-2">
                {error ? <Banner tone="danger">{error}</Banner> : null}
                {notice ? <Banner tone="success">{notice}</Banner> : null}
              </div>
            ) : null}

            <div className={`grid min-h-0 flex-1 ${isPreviewOpen ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto px-6 py-5">
                <input
                  aria-label="Source title"
                  className="h-11 w-full shrink-0 bg-transparent text-2xl font-extrabold text-ink placeholder:text-gray-500"
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder="Untitled source"
                  ref={titleInputRef}
                  value={title}
                />
                <textarea
                  aria-label="Source body"
                  className="-mx-4 min-h-[320px] flex-1 resize-none rounded-lg border border-transparent bg-transparent p-4 text-[15px] leading-7 text-gray-700 placeholder:text-gray-500 focus:border-gray-200 focus:bg-slate-50 focus:outline-none"
                  onChange={(event) => onBodyChange(event.target.value)}
                  placeholder={
                    sourceRole === 'reference'
                      ? 'Paste paper highlights, reference excerpts, or source notes.'
                      : 'Write notes here. Indexing will draft knowledge updates for review.'
                  }
                  value={bodyMarkdown}
                />
              </div>

              {isPreviewOpen ? (
                <aside
                  aria-label="Markdown preview"
                  className="min-h-0 min-w-0 overflow-y-auto border-l border-gray-200 bg-slate-50 px-6 py-5"
                >
                  {title.trim() ? <h2 className="mb-4 text-xl font-extrabold text-ink">{title}</h2> : null}
                  {bodyMarkdown.trim() ? (
                    <MarkdownPreview markdown={bodyMarkdown} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-surface p-4 text-sm leading-6 text-gray-600">
                      Nothing to preview yet.
                    </div>
                  )}
                </aside>
              ) : null}
            </div>
          </form>

          <aside
            aria-label="Source details"
            className="hidden min-h-0 flex-col border-l border-gray-200 bg-surface xl:flex"
          >
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <section className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-bold text-ink">Lifecycle</h2>
                  <Pill tone={lifecycleTone[selectedLifecycle.tone]}>{selectedLifecycle.label}</Pill>
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {([
                    ['Saved', Boolean(selectedSource)],
                    ['Chunked', selectedChunks.length > 0],
                    ['Indexed', indexingTrace ? indexingTrace.agentRuns.length > 0 : false],
                    ['In review', indexingTrace ? indexingTrace.proposals.length > 0 : false],
                  ] as Array<[string, boolean]>).map(([label, isReady]) => (
                    <li
                      className={`flex items-center gap-1.5 text-xs font-semibold ${
                        isReady ? 'text-emerald-800' : 'text-gray-500'
                      }`}
                      key={label}
                    >
                      {isReady ? (
                        <CheckCircle2 aria-hidden size={14} />
                      ) : (
                        <Circle aria-hidden size={14} />
                      )}
                      {label}
                      <span className="sr-only">{isReady ? ' (done)' : ' (not yet)'}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {selectedSource && indexingTrace ? (
                <section className="rounded-lg border border-gray-200 bg-surface p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-[13px] font-bold text-ink">Index trace</h2>
                    <Pill className="capitalize">{indexingTrace.agentRuns[0]?.status ?? 'idle'}</Pill>
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    {[
                      ['Runs', indexingTrace.agentRuns.length],
                      ['Proposals', indexingTrace.proposals.length],
                      ['Items', indexingTrace.proposals[0]?.items.length ?? 0],
                    ].map(([label, value]) => (
                      <div className="flex items-center justify-between" key={label}>
                        <dt className="text-gray-600">{label}</dt>
                        <dd className="font-bold tabular-nums text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {activeProposal ? (
                    <p className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-600">
                      {activeProposal.rationale ?? 'Proposal generated from this source.'}
                    </p>
                  ) : indexingTrace.status === 'Failed' ? (
                    <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                      {indexingTrace.agentRuns[0]?.error ?? 'Indexing failed. No proposal was created.'}
                    </p>
                  ) : (
                    <p className="mt-3 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-600">
                      Index this source to draft a proposal.
                    </p>
                  )}
                </section>
              ) : null}

              <section className="rounded-lg border border-gray-200 bg-surface p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-bold text-ink">Chunks</h2>
                  <Pill>{selectedChunks.length}</Pill>
                </div>
                {selectedChunks.length ? (
                  <div className="space-y-1.5">
                    {selectedChunks.map((chunk) => (
                      <details className="group rounded-md border border-gray-200 bg-slate-50" key={chunk.id}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2">
                          <span className="min-w-0 truncate text-xs font-bold text-ink">
                            {chunk.heading ?? `Chunk ${chunk.chunkIndex + 1}`}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-gray-500">
                            ~{chunk.tokenEstimate}
                            <ChevronDown
                              aria-hidden
                              className="transition-transform group-open:rotate-180"
                              size={12}
                            />
                          </span>
                        </summary>
                        <p className="px-2.5 pb-2.5 text-xs leading-5 text-gray-600">{chunk.bodyMarkdown}</p>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-gray-300 p-3 text-xs leading-5 text-gray-600">
                    Save this source to create indexing chunks.
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                <h2 className="text-[13px] font-bold text-ink">Metadata</h2>
                <dl className="mt-3 space-y-1.5 text-xs">
                  {[
                    ['Role', roleLabel(sourceRole)],
                    [
                      'Type',
                      sourceTypeLabel(
                        selectedSource?.sourceType ?? (sourceRole === 'reference' ? 'paper' : 'manual'),
                      ),
                    ],
                    ['Updated', formatDate(selectedSource?.updatedAt)],
                  ].map(([label, value]) => (
                    <div className="flex items-center justify-between gap-3" key={label}>
                      <dt className="text-gray-600">{label}</dt>
                      <dd className="font-semibold text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
