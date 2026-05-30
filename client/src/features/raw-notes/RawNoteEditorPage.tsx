import React from 'react'
import { BookOpen, CheckCircle2, Eye, FileText, PencilLine, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { MarkdownPreview } from '../../components/MarkdownPreview'
import type {
  AgentRun,
  Proposal,
  RawNote,
  RawNoteIndexingTrace,
  RawSource,
  RawSourceRole,
} from '../../types/domain'

type SourceLifecycle = {
  label: string
  tone: 'idle' | 'active' | 'pending' | 'done' | 'failed'
}

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
    idle: 'border-[#3A3A3A] bg-[#252525] text-gray-300',
    active: 'border-violet/60 bg-violet/15 text-violet-100',
    pending: 'border-amber-700/70 bg-amber-950/30 text-amber-100',
    done: 'border-emerald-800/70 bg-emerald-950/30 text-emerald-100',
    failed: 'border-red-900/70 bg-red-950/40 text-red-100',
  }[tone]
}

export function RawNoteEditorPage({
  indexingTrace,
  rawNotes,
  rawSources,
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
}: {
  indexingTrace: RawNoteIndexingTrace | null
  rawNotes: RawNote[]
  rawSources: RawSource[]
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
}) {
  const selectedRawNote = rawNotes.find((note) => note.id === selectedRawNoteId) ?? null
  const sourceById = new Map(rawSources.map((source) => [source.id, source]))
  const selectedRawSource = selectedRawNote?.rawSourceId
    ? sourceById.get(selectedRawNote.rawSourceId) ?? null
    : null
  const selectedChunks = selectedRawSource?.chunks ?? []
  const selectedLifecycle = selectedRawNote
    ? getLifecycle(selectedRawNote, proposals, agentRuns)
    : { label: 'Draft', tone: 'idle' as const }
  const visibleRawNotes = rawNotes.slice(0, 12)

  return (
    <section className="flex min-h-0 flex-1 bg-[#181818] text-white">
      <aside className="flex w-[304px] shrink-0 flex-col border-r border-[#2B2B2B] bg-[#181818] px-5 py-6">
        <div className="mb-7 flex items-center gap-4">
          <PencilLine size={34} strokeWidth={1.9} className="text-gray-400" />
          <h1 className="text-[26px] font-semibold leading-none tracking-normal text-gray-100">
            Sources
          </h1>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Source inbox
          </p>
          <span className="rounded-full bg-[#2A2A2A] px-2 py-0.5 text-[11px] font-bold text-gray-300">
            {rawNotes.length}
          </span>
        </div>

        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {rawNotes.length ? (
            visibleRawNotes.map((note) => {
              const source = note.rawSourceId ? sourceById.get(note.rawSourceId) ?? null : null
              const lifecycle = getLifecycle(note, proposals, agentRuns)

              return (
                <button
                  className={`w-full rounded-md border p-3 text-left transition ${
                    note.id === selectedRawNoteId
                      ? 'border-violet bg-[#252039]'
                      : 'border-[#2B2B2B] bg-[#202020] hover:border-[#3A3A3A]'
                  }`}
                  key={note.id}
                  onClick={() => onSelectRawNote(note)}
                  type="button"
                >
                  <p className="line-clamp-1 text-[13px] font-bold text-gray-100">
                    {note.title ?? 'Untitled source'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[#2A2A2A] px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                      {note.sourceRole === 'reference' ? 'Reference' : 'Personal note'}
                    </span>
                    <span className="rounded-full bg-[#2A2A2A] px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                      {source?.chunks.length ?? 0} chunks
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${lifecycleClass(
                        lifecycle.tone,
                      )}`}
                    >
                      {lifecycle.label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">
                    {note.bodyMarkdown}
                  </p>
                </button>
              )
            })
          ) : (
            <p className="rounded-md border border-[#2B2B2B] bg-[#202020] p-3 text-xs leading-5 text-gray-400">
              No sources yet.
            </p>
          )}
        </div>
      </aside>

      <form className="flex min-w-0 flex-1 flex-col bg-[#202020]" onSubmit={onSubmit}>
        <header className="flex h-[78px] items-center justify-between gap-4 border-b border-[#303030] px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {selectedRawNote
                ? isDirty
                  ? 'Editing source'
                  : 'Saved source'
                : 'New source'}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <h2 className="text-[15px] font-bold text-gray-100">
                {selectedRawNote?.title ?? 'Capture source evidence'}
              </h2>
              {selectedRawNote ? (
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${lifecycleClass(
                    selectedLifecycle.tone,
                  )}`}
                >
                  {indexingTrace?.status ?? selectedLifecycle.label}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-10 rounded-lg border border-[#3A3A3A] bg-[#191919] p-1">
              {[
                { value: 'personal_note' as const, label: 'Personal', icon: PencilLine },
                { value: 'reference' as const, label: 'Reference', icon: BookOpen },
              ].map((option) => {
                const Icon = option.icon
                return (
                  <button
                    className={`flex items-center gap-1.5 rounded-md px-3 text-[12px] font-extrabold transition ${
                      sourceRole === option.value
                        ? 'bg-[#303030] text-white'
                        : 'text-gray-500 hover:text-gray-200'
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
              className="flex h-10 items-center gap-2 rounded-lg border border-[#3A3A3A] px-3.5 text-[13px] font-bold text-gray-200 hover:bg-[#2A2A2A]"
              onClick={onNewNote}
              type="button"
            >
              <Plus size={16} />
              New source
            </button>
            {selectedRawNote ? (
              <>
                <button
                  className="flex h-10 items-center gap-2 rounded-lg border border-[#3A3A3A] px-3.5 text-[13px] font-bold text-gray-200 hover:bg-[#2A2A2A] disabled:opacity-50"
                  disabled={isSubmitting || !isDirty}
                  onClick={onSave}
                  type="button"
                >
                  <Save size={16} />
                  Save
                </button>
                <button
                  aria-label="Delete source"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-red-900/70 text-red-200 hover:bg-red-950/40 disabled:opacity-50"
                  disabled={isSubmitting}
                  onClick={onDelete}
                  title="Delete source"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </>
            ) : null}
            <button
              className="flex h-10 items-center gap-2 rounded-lg bg-violet px-4 text-[13px] font-extrabold text-white disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              <Sparkles size={16} />
              {isSubmitting ? 'Compiling' : selectedRawNote ? 'Compile saved' : 'Compile source'}
            </button>
          </div>
        </header>

        {error ? (
          <div className="mx-8 mt-5 rounded-lg border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mx-8 mt-5 rounded-lg border border-emerald-900/60 bg-emerald-950/50 px-4 py-3 text-sm font-semibold text-emerald-100">
            {notice}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,1fr)_minmax(320px,0.9fr)] gap-0">
          <div className="flex min-h-0 flex-col px-8 py-7">
            <input
              aria-label="Source title"
              className="mb-5 h-14 w-full border-0 bg-transparent text-3xl font-semibold tracking-normal text-white outline-none placeholder:text-gray-600"
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Untitled source"
              ref={titleInputRef}
              value={title}
            />
            <textarea
              aria-label="Source body"
              className="min-h-0 flex-1 resize-none border-0 bg-transparent text-[15px] leading-7 text-gray-200 outline-none placeholder:text-gray-600"
              onChange={(event) => onBodyChange(event.target.value)}
              placeholder={
                sourceRole === 'reference'
                  ? 'Paste paper highlights, reference excerpts, or source notes. The indexer will draft knowledge updates after you compile.'
                  : 'Write the messy version here. The compiler will turn it into proposal-backed knowledge after you compile.'
              }
              value={bodyMarkdown}
            />
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-[#303030] bg-[#1B1B1B] px-7 py-7">
            <div className="mb-5 flex items-center gap-2 text-[13px] font-bold text-gray-300">
              {sourceRole === 'reference' ? (
                <FileText size={16} className="text-gray-500" />
              ) : (
                <Eye size={16} className="text-gray-500" />
              )}
              Preview
            </div>
            {selectedRawNote && indexingTrace ? (
              <div className="mb-5 rounded-lg border border-[#303030] bg-[#202020] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[12px] font-extrabold text-gray-100">Indexing trace</p>
                  <span className="rounded-full bg-[#2A2A2A] px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                    {indexingTrace.agentRuns[0]?.status ?? 'idle'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ['Runs', indexingTrace.agentRuns.length],
                    ['Proposals', indexingTrace.proposals.length],
                    ['Items', indexingTrace.proposals[0]?.items.length ?? 0],
                  ].map(([label, value]) => (
                    <div className="rounded-md border border-[#303030] bg-[#171717] p-2" key={label}>
                      <p className="text-[10px] font-bold uppercase text-gray-500">{label}</p>
                      <p className="mt-1 text-base font-extrabold text-white">{value}</p>
                    </div>
                  ))}
                </div>
                {indexingTrace.proposals[0] ? (
                  <p className="mt-3 text-xs leading-5 text-gray-400">
                    {indexingTrace.proposals[0].rationale ?? 'Proposal generated from this source.'}
                  </p>
                ) : indexingTrace.status === 'Failed' ? (
                  <p className="mt-3 rounded-md border border-red-900/60 bg-red-950/40 p-3 text-xs leading-5 text-red-100">
                    {indexingTrace.agentRuns[0]?.error ??
                      'LLM wiki indexing failed. No proposal was created.'}
                  </p>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-gray-500">
                    Compile this source with LLM wiki indexing to create a proposal.
                  </p>
                )}
              </div>
            ) : null}
            {selectedRawNote ? (
              <div className="mb-5 rounded-lg border border-[#303030] bg-[#202020] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[12px] font-extrabold text-gray-100">Source lifecycle</p>
                  <span className="rounded-full bg-[#2A2A2A] px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                    {selectedChunks.length} chunks
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold uppercase">
                  {([
                    ['Captured', true],
                    ['Chunked', selectedChunks.length > 0],
                    ['Indexed', indexingTrace ? indexingTrace.agentRuns.length > 0 : false],
                    ['Approval', indexingTrace ? indexingTrace.proposals.length > 0 : false],
                  ] as Array<[string, boolean]>).map(([label, isReady]) => (
                    <div
                      className={`rounded-md border px-2 py-2 text-center ${
                        isReady
                          ? 'border-emerald-900/70 bg-emerald-950/30 text-emerald-100'
                          : 'border-[#303030] bg-[#171717] text-gray-500'
                      }`}
                      key={label}
                    >
                      {isReady ? <CheckCircle2 className="mx-auto mb-1" size={13} /> : null}
                      {label}
                    </div>
                  ))}
                </div>
                {selectedChunks.length ? (
                  <div className="mt-4 space-y-2">
                    {selectedChunks.slice(0, 3).map((chunk) => (
                      <div className="rounded-md border border-[#303030] bg-[#171717] p-3" key={chunk.id}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <p className="line-clamp-1 text-[11px] font-bold text-gray-300">
                            {chunk.heading ?? `Chunk ${chunk.chunkIndex + 1}`}
                          </p>
                          <span className="text-[10px] font-bold uppercase text-gray-600">
                            ~{chunk.tokenEstimate} tokens
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs leading-5 text-gray-500">
                          {chunk.bodyMarkdown}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-gray-500">
                    Saving this source will create chunks for indexing and retrieval.
                  </p>
                )}
              </div>
            ) : null}
            {title.trim() ? (
              <h2 className="mb-5 text-2xl font-bold tracking-normal text-white">{title}</h2>
            ) : null}
            {bodyMarkdown.trim() ? (
              <MarkdownPreview markdown={bodyMarkdown} />
            ) : (
              <div className="rounded-lg border border-dashed border-[#3A3A3A] p-4 text-sm leading-6 text-gray-500">
                Nothing to preview yet.
              </div>
            )}
          </aside>
        </div>
      </form>
    </section>
  )
}
