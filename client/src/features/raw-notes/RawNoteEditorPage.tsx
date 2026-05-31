import React, { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  Folder,
  GitBranch,
  Inbox,
  Library,
  PanelRight,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { MarkdownPreview } from '../../components/MarkdownPreview'
import type {
  AgentRun,
  Proposal,
  RawNote,
  RawNoteIndexingTrace,
  RawSource,
  RawSourceRole,
  SourceProject,
} from '../../types/domain'

type SourceLifecycle = {
  label: string
  tone: 'idle' | 'active' | 'pending' | 'done' | 'failed'
}

type RoleFilter = 'all' | RawSourceRole
type LifecycleFilter = 'all' | SourceLifecycle['tone']
type FolderFilter = 'all' | 'uncategorized' | string

function getRunRawNoteId(agentRun: AgentRun) {
  if (!agentRun.input || typeof agentRun.input !== 'object') {
    return null
  }

  const input = agentRun.input as { rawNoteId?: unknown }
  return typeof input.rawNoteId === 'string' ? input.rawNoteId : null
}

function getLifecycle(note: RawNote, proposals: Proposal[], agentRuns: AgentRun[]): SourceLifecycle {
  const noteProposals = proposals.filter((proposal) => proposal.rawNoteId === note.id)
  const noteRuns = agentRuns.filter((agentRun) => getRunRawNoteId(agentRun) === note.id)
  const hasActiveRun = noteRuns.some((agentRun) => ['queued', 'running'].includes(agentRun.status))
  const latestProposal = noteProposals[0] ?? null
  const latestFailedRun = noteRuns.find((agentRun) => agentRun.status === 'failed')

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

function lifecycleClass(tone: SourceLifecycle['tone']) {
  return {
    idle: 'border-gray-200 bg-slate-100 text-gray-600',
    active: 'border-violet/30 bg-violet/10 text-violet',
    pending: 'border-amber-200 bg-amber-50 text-amber-800',
    done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    failed: 'border-red-200 bg-red-50 text-red-700',
  }[tone]
}

function roleLabel(role: RawSourceRole) {
  return role === 'reference' ? 'Reference' : 'Personal note'
}

function sourceTypeLabel(sourceType: string) {
  return sourceType.replaceAll('_', ' ')
}

function sourceTitle(note: RawNote | null | undefined, source: RawSource | null | undefined) {
  return source?.title ?? note?.title ?? 'Untitled source'
}

function projectSourceCount(project: SourceProject | undefined, fallbackCount: number) {
  return project?.sourceCount ?? fallbackCount
}

function formatDate(value: string | undefined) {
  if (!value) return 'Draft'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function NavButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean
  count?: number
  icon: typeof Inbox
  label: string
  onClick?: () => void
}) {
  return (
    <button
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold ${
        active ? 'bg-slate-100 text-ink' : 'text-gray-600 hover:bg-slate-50 hover:text-ink'
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon size={15} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === 'number' ? (
        <span className="text-[11px] font-bold text-gray-400">{count}</span>
      ) : null}
    </button>
  )
}

function SmallPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
      {children}
    </span>
  )
}

export function RawNoteEditorPage({
  indexingTrace,
  rawNotes,
  rawSources,
  sourceProjects,
  proposals,
  agentRuns,
  selectedRawNoteId,
  isDirty,
  title,
  sourceRole,
  bodyMarkdown,
  isSubmitting,
  notice,
  error,
  titleInputRef,
  onTitleChange,
  onBodyChange,
  onSourceRoleChange,
  onNewNote,
  onSelectRawNote,
  onSave,
  onDelete,
  onSubmit,
  onOpenKnowledgeMap,
  onOpenReviewQueue,
}: {
  indexingTrace: RawNoteIndexingTrace | null
  rawNotes: RawNote[]
  rawSources: RawSource[]
  sourceProjects: SourceProject[]
  proposals: Proposal[]
  agentRuns: AgentRun[]
  selectedRawNoteId: string | null
  isDirty: boolean
  title: string
  sourceRole: RawSourceRole
  bodyMarkdown: string
  isSubmitting: boolean
  notice: string | null
  error: string | null
  titleInputRef: React.RefObject<HTMLInputElement | null>
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onSourceRoleChange: (value: RawSourceRole) => void
  onNewNote: () => void
  onSelectRawNote: (note: RawNote) => void
  onSave: () => void
  onDelete: () => void
  onSubmit: (event: React.FormEvent) => void
  onOpenKnowledgeMap?: () => void
  onOpenReviewQueue?: () => void
}) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('all')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<FolderFilter>('all')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const selectedRawNote = rawNotes.find((note) => note.id === selectedRawNoteId) ?? null
  const sourceById = useMemo(() => new Map(rawSources.map((source) => [source.id, source])), [rawSources])
  const selectedRawSource = selectedRawNote?.rawSourceId
    ? sourceById.get(selectedRawNote.rawSourceId) ?? null
    : null
  const selectedChunks = selectedRawSource?.chunks ?? []
  const selectedLifecycle = selectedRawNote
    ? getLifecycle(selectedRawNote, proposals, agentRuns)
    : { label: 'Draft', tone: 'idle' as const }
  const pendingCount = proposals.filter((proposal) => proposal.status === 'pending').length
  const selectedProject = sourceProjects.find((project) => project.id === selectedProjectId)

  useEffect(() => {
    if (selectedProjectId !== 'all' && !sourceProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId('all')
      setSelectedFolderFilter('all')
    }
  }, [selectedProjectId, sourceProjects])

  useEffect(() => {
    if (
      selectedFolderFilter !== 'all' &&
      selectedFolderFilter !== 'uncategorized' &&
      !selectedProject?.folders.some((folder) => folder.id === selectedFolderFilter)
    ) {
      setSelectedFolderFilter('all')
    }
  }, [selectedFolderFilter, selectedProject])

  const sourceRows = useMemo(() => {
    return rawNotes.map((note) => {
      const source = note.rawSourceId ? sourceById.get(note.rawSourceId) ?? null : null
      const lifecycle = getLifecycle(note, proposals, agentRuns)
      return { lifecycle, note, source }
    })
  }, [agentRuns, proposals, rawNotes, sourceById])

  const filteredRows = sourceRows.filter(({ lifecycle, note, source }) => {
    const matchesProject = selectedProjectId === 'all' || source?.projectId === selectedProjectId
    const matchesFolder =
      selectedFolderFilter === 'all' ||
      (selectedFolderFilter === 'uncategorized' && !source?.folderId) ||
      source?.folderId === selectedFolderFilter
    const matchesRole = roleFilter === 'all' || note.sourceRole === roleFilter
    const matchesLifecycle = lifecycleFilter === 'all' || lifecycle.tone === lifecycleFilter
    return matchesProject && matchesFolder && matchesRole && matchesLifecycle
  })

  const activeProposal = indexingTrace?.proposals[0] ?? null

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[156px_240px_minmax(0,1fr)] bg-canvas text-ink">
      <aside className="flex min-h-0 flex-col border-r border-gray-200 bg-white px-3 py-4">
        <div className="mb-4 px-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Workspace</p>
          <h1 className="mt-1 text-lg font-extrabold text-ink">Knowledge sources</h1>
        </div>

        <div className="space-y-1">
          <NavButton
            active={selectedProjectId === 'all'}
            count={rawNotes.length}
            icon={Inbox}
            label="All sources"
            onClick={() => {
              setSelectedProjectId('all')
              setSelectedFolderFilter('all')
            }}
          />
          {sourceProjects.map((project) => (
            <NavButton
              active={selectedProjectId === project.id && selectedFolderFilter === 'all'}
              count={projectSourceCount(project, rawSources.filter((source) => source.projectId === project.id).length)}
              icon={Folder}
              key={project.id}
              label={project.name}
              onClick={() => {
                setSelectedProjectId(project.id)
                setSelectedFolderFilter('all')
              }}
            />
          ))}
        </div>

        {selectedProject ? (
          <div className="mt-5 space-y-1">
            <p className="px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Folders</p>
            <NavButton
              active={selectedFolderFilter === 'uncategorized'}
              count={selectedProject.uncategorizedSourceCount}
              icon={Inbox}
              label="Uncategorized"
              onClick={() => setSelectedFolderFilter('uncategorized')}
            />
            {selectedProject.folders.map((folder) => (
              <NavButton
                active={selectedFolderFilter === folder.id}
                count={folder.sourceCount}
                icon={Folder}
                key={folder.id}
                label={folder.name}
                onClick={() => setSelectedFolderFilter(folder.id)}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-5 space-y-1">
          <p className="px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Types</p>
          <NavButton
            active={roleFilter === 'personal_note'}
            count={rawNotes.filter((note) => note.sourceRole === 'personal_note').length}
            icon={PencilLine}
            label="Personal notes"
            onClick={() => setRoleFilter(roleFilter === 'personal_note' ? 'all' : 'personal_note')}
          />
          <NavButton
            active={roleFilter === 'reference'}
            count={rawNotes.filter((note) => note.sourceRole === 'reference').length}
            icon={BookOpen}
            label="References"
            onClick={() => setRoleFilter(roleFilter === 'reference' ? 'all' : 'reference')}
          />
        </div>

        <div className="mt-5 space-y-1">
          <p className="px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Open</p>
          <NavButton icon={Library} label="Knowledge" onClick={onOpenKnowledgeMap} />
          <NavButton count={pendingCount} icon={GitBranch} label="Review Queue" onClick={onOpenReviewQueue} />
        </div>

        <div className="mt-auto rounded-lg border border-gray-200 bg-slate-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Index status</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <p className="text-lg font-extrabold text-ink">{rawSources.length}</p>
              <p className="text-[11px] text-gray-500">sources</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-ink">
                {sourceRows.filter((row) => row.lifecycle.tone === 'pending').length}
              </p>
              <p className="text-[11px] text-gray-500">pending</p>
            </div>
          </div>
        </div>
      </aside>

      <aside className="flex min-h-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Source inbox</p>
              <p className="text-sm font-extrabold text-ink">{filteredRows.length} visible</p>
            </div>
            <button
              aria-label="New source"
              className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-white"
              onClick={onNewNote}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Filter sources by role"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-ink outline-none"
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              value={roleFilter}
            >
              <option value="all">All roles</option>
              <option value="personal_note">Personal</option>
              <option value="reference">Reference</option>
            </select>
            <select
              aria-label="Filter sources by status"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-ink outline-none"
              onChange={(event) => setLifecycleFilter(event.target.value as LifecycleFilter)}
              value={lifecycleFilter}
            >
              <option value="all">All states</option>
              <option value="idle">Captured</option>
              <option value="active">Indexing</option>
              <option value="pending">Needs approval</option>
              <option value="done">Applied</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filteredRows.length ? (
            filteredRows.map(({ lifecycle, note, source }) => (
              <button
                className={`w-full rounded-lg border p-3 text-left transition ${
                  note.id === selectedRawNoteId
                    ? 'border-violet bg-violet/10'
                    : 'border-transparent hover:border-gray-200 hover:bg-slate-50'
                }`}
                key={note.id}
                onClick={() => onSelectRawNote(note)}
                type="button"
              >
                <div className="mb-2 flex items-start gap-2">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500">
                    {note.sourceRole === 'reference' ? <BookOpen size={14} /> : <FileText size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] font-extrabold text-ink">
                      {sourceTitle(note, source)}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-gray-500">
                      {formatDate(source?.updatedAt ?? note.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <SmallPill>{roleLabel(note.sourceRole)}</SmallPill>
                  <SmallPill>{source?.chunks.length ?? 0} chunks</SmallPill>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${lifecycleClass(lifecycle.tone)}`}>
                    {lifecycle.label}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-gray-500">{note.bodyMarkdown}</p>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-slate-50 p-4 text-sm leading-6 text-gray-500">
              No sources match these filters.
            </div>
          )}
        </div>
      </aside>

      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_232px]">
      <form className="flex min-h-0 min-w-0 flex-col bg-white" onSubmit={onSubmit}>
        <header className="shrink-0 border-b border-gray-200 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {selectedRawNote ? (isDirty ? 'Unsaved changes' : 'Saved source') : 'New source'}
              </p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${lifecycleClass(selectedLifecycle.tone)}`}>
                {indexingTrace?.status ?? selectedLifecycle.label}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-extrabold text-ink">
              {selectedRawNote ? sourceTitle(selectedRawNote, selectedRawSource) : 'Capture source evidence'}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex h-9 rounded-lg border border-gray-200 bg-slate-50 p-1">
              {[
                { value: 'personal_note' as const, label: 'Personal', icon: PencilLine },
                { value: 'reference' as const, label: 'Reference', icon: BookOpen },
              ].map((option) => {
                const Icon = option.icon
                return (
                  <button
                    className={`flex items-center gap-1.5 rounded-md px-2.5 text-[12px] font-extrabold transition ${
                      sourceRole === option.value ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'
                    }`}
                    key={option.value}
                    onClick={() => onSourceRoleChange(option.value)}
                    type="button"
                  >
                    <Icon size={14} />
                    {option.label}
                  </button>
                )
              })}
            </div>
            <button
              aria-label={isPreviewOpen ? 'Hide preview' : 'Show preview'}
              className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-slate-50"
              onClick={() => setIsPreviewOpen((current) => !current)}
              title={isPreviewOpen ? 'Hide preview' : 'Show preview'}
              type="button"
            >
              {isPreviewOpen ? <PanelRight size={16} /> : <Eye size={16} />}
            </button>
            {selectedRawNote ? (
              <>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-ink disabled:opacity-50"
                  disabled={isSubmitting || !isDirty}
                  onClick={onSave}
                  type="button"
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  aria-label="Delete source"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                  disabled={isSubmitting}
                  onClick={onDelete}
                  title="Delete source"
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </>
            ) : null}
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet px-3 text-xs font-extrabold text-white disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              <Sparkles size={14} />
              {isSubmitting ? 'Indexing' : selectedRawNote ? 'Index source' : 'Save & index'}
            </button>
          </div>
        </header>

        {error ? (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-[430px] flex-col px-6 py-5">
            <input
              aria-label="Source title"
              className="mb-4 h-11 w-full border-0 bg-transparent text-2xl font-extrabold tracking-normal text-ink outline-none placeholder:text-gray-400"
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Untitled source"
              ref={titleInputRef}
              value={title}
            />
            <textarea
              aria-label="Source body"
              className="min-h-0 flex-1 resize-none rounded-lg border border-transparent bg-transparent p-0 text-[15px] leading-7 text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-200 focus:bg-slate-50 focus:p-4"
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
            <aside className="border-t border-gray-200 bg-slate-50 px-5 py-5">
              <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold text-gray-600">
                <Eye size={15} />
                Preview
              </div>
              {title.trim() ? <h2 className="mb-4 text-xl font-extrabold text-ink">{title}</h2> : null}
              {bodyMarkdown.trim() ? (
                <MarkdownPreview markdown={bodyMarkdown} />
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm leading-6 text-gray-500">
                  Nothing to preview yet.
                </div>
              )}
            </aside>
          ) : null}
        </div>
      </form>

      <aside className="flex min-h-0 flex-col border-l border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Context</p>
          <h2 className="mt-1 text-sm font-extrabold text-ink">Indexing and chunks</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section className="rounded-lg border border-gray-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[12px] font-extrabold text-ink">Lifecycle</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${lifecycleClass(selectedLifecycle.tone)}`}>
                {selectedLifecycle.label}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold uppercase">
              {([
                ['Saved', Boolean(selectedRawNote)],
                ['Chunked', selectedChunks.length > 0],
                ['Indexed', indexingTrace ? indexingTrace.agentRuns.length > 0 : false],
                ['Review', indexingTrace ? indexingTrace.proposals.length > 0 : false],
              ] as Array<[string, boolean]>).map(([label, isReady]) => (
                <div
                  className={`rounded-md border px-1.5 py-2 ${
                    isReady
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-white text-gray-400'
                  }`}
                  key={label}
                >
                  {isReady ? <CheckCircle2 className="mx-auto mb-1" size={13} /> : <Clock3 className="mx-auto mb-1" size={13} />}
                  {label}
                </div>
              ))}
            </div>
          </section>

          {selectedRawNote && indexingTrace ? (
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[12px] font-extrabold text-ink">Index trace</p>
                <SmallPill>{indexingTrace.agentRuns[0]?.status ?? 'idle'}</SmallPill>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Runs', indexingTrace.agentRuns.length],
                  ['Proposals', indexingTrace.proposals.length],
                  ['Items', indexingTrace.proposals[0]?.items.length ?? 0],
                ].map(([label, value]) => (
                  <div className="rounded-md border border-gray-200 bg-slate-50 p-2" key={label}>
                    <p className="text-[10px] font-bold uppercase text-gray-500">{label}</p>
                    <p className="mt-1 text-base font-extrabold text-ink">{value}</p>
                  </div>
                ))}
              </div>
              {activeProposal ? (
                <p className="mt-3 text-xs leading-5 text-gray-600">
                  {activeProposal.rationale ?? 'Proposal generated from this source.'}
                </p>
              ) : indexingTrace.status === 'Failed' ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                  {indexingTrace.agentRuns[0]?.error ?? 'LLM wiki indexing failed. No proposal was created.'}
                </p>
              ) : (
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Index this source to draft a proposal.
                </p>
              )}
            </section>
          ) : null}

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[12px] font-extrabold text-ink">Chunks</p>
              <SmallPill>{selectedChunks.length}</SmallPill>
            </div>
            {selectedChunks.length ? (
              <div className="space-y-2">
                {selectedChunks.map((chunk) => (
                  <details className="rounded-md border border-gray-200 bg-slate-50 p-3" key={chunk.id}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[12px] font-extrabold text-ink">
                        {chunk.heading ?? `Chunk ${chunk.chunkIndex + 1}`}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase text-gray-500">
                        ~{chunk.tokenEstimate}
                        <ChevronDown size={12} />
                      </span>
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-gray-600">{chunk.bodyMarkdown}</p>
                  </details>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-gray-300 bg-slate-50 p-3 text-xs leading-5 text-gray-500">
                Save this source to create indexing chunks.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-slate-50 p-4">
            <p className="text-[12px] font-extrabold text-ink">Source metadata</p>
            <div className="mt-3 space-y-2 text-xs leading-5 text-gray-600">
              <p>
                <span className="font-bold text-gray-500">Role:</span>{' '}
                {roleLabel(sourceRole)}
              </p>
              <p>
                <span className="font-bold text-gray-500">Type:</span>{' '}
                {sourceTypeLabel(selectedRawSource?.sourceType ?? (sourceRole === 'reference' ? 'paper' : 'manual'))}
              </p>
              <p>
                <span className="font-bold text-gray-500">Updated:</span>{' '}
                {formatDate(selectedRawSource?.updatedAt ?? selectedRawNote?.createdAt)}
              </p>
            </div>
          </section>
        </div>
      </aside>
      </div>
    </section>
  )
}
