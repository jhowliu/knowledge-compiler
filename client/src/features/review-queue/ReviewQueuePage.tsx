import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  FileText,
  GitBranch,
  ListChecks,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react'
import { actionLabel, payloadLabel, payloadText } from '../../lib/knowledge'
import type { NoteLink, Proposal, RawNote } from '../../types/domain'

type ReviewTab = 'notes' | 'links' | 'done'

const tabs: Array<{ key: ReviewTab; label: string }> = [
  { key: 'notes', label: 'Notes' },
  { key: 'links', label: 'Links' },
  { key: 'done', label: 'Done' },
]

function statusClass(status: string) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-violet/30 bg-violet/10 text-violet'
}

function rawNoteTitle(rawNote: RawNote | undefined) {
  return rawNote?.title ?? 'Untitled raw note'
}

function itemVerb(actionType: string) {
  if (actionType === 'upsert_compiled_note') return 'Note'
  if (actionType === 'create_mistake') return 'Mistake'
  if (actionType === 'create_review_task') return 'Review'
  if (actionType === 'upsert_readiness') return 'Readiness'
  return 'Update'
}

function summarizeProposal(proposal: Proposal) {
  const notes = proposal.items.filter((item) => item.actionType === 'upsert_compiled_note').length
  const mistakes = proposal.items.filter((item) => item.actionType === 'create_mistake').length
  const reviews = proposal.items.filter((item) => item.actionType === 'create_review_task').length
  const readiness = proposal.items.filter((item) => item.actionType === 'upsert_readiness').length
  return [
    notes ? `${notes} note${notes > 1 ? 's' : ''}` : null,
    mistakes ? `${mistakes} mistake${mistakes > 1 ? 's' : ''}` : null,
    reviews ? `${reviews} review${reviews > 1 ? 's' : ''}` : null,
    readiness ? `${readiness} readiness` : null,
  ].filter(Boolean).join(' · ')
}

function EmptyState({ activeTab }: { activeTab: ReviewTab }) {
  const copy =
    activeTab === 'links'
      ? 'No link suggestions waiting. Links appear after note updates are applied.'
      : activeTab === 'done'
        ? 'No reviewed updates yet.'
        : 'No note updates waiting. Capture and compile a raw note to start.'

  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-[420px] rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <Sparkles className="mx-auto mb-4 text-violet" size={34} />
        <h3 className="text-lg font-extrabold text-ink">Inbox is clear</h3>
        <p className="mt-2 text-sm leading-6 text-gray-500">{copy}</p>
      </div>
    </div>
  )
}

export function ReviewQueuePage({
  proposals,
  rawNotes,
  noteLinks,
  selectedProposalId,
  isSubmitting,
  notice,
  error,
  onSelectProposal,
  onApproveProposal,
  onRejectProposal,
  onApproveNoteLink,
  onRejectNoteLink,
  onRefresh,
}: {
  proposals: Proposal[]
  rawNotes: RawNote[]
  noteLinks: NoteLink[]
  selectedProposalId: string | null
  isSubmitting: boolean
  notice: string | null
  error: string | null
  onSelectProposal: (proposalId: string) => void
  onApproveProposal: (proposalId: string) => void
  onRejectProposal: (proposalId: string) => void
  onApproveNoteLink: (linkId: string) => void
  onRejectNoteLink: (linkId: string) => void
  onRefresh: () => void
}) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('notes')
  const pendingProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'pending'),
    [proposals],
  )
  const reviewedProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status !== 'pending'),
    [proposals],
  )
  const pendingNoteLinks = useMemo(
    () => noteLinks.filter((link) => link.status === 'pending'),
    [noteLinks],
  )
  const selectedProposal =
    proposals.find((proposal) => proposal.id === selectedProposalId) ??
    pendingProposals[0] ??
    reviewedProposals[0] ??
    null
  const sourceRawNote = selectedProposal?.rawNoteId
    ? rawNotes.find((rawNote) => rawNote.id === selectedProposal.rawNoteId)
    : undefined
  const activeList = activeTab === 'done' ? reviewedProposals : pendingProposals

  return (
    <section className="flex min-h-0 flex-1 bg-canvas text-ink">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-gray-200 bg-white px-5 py-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet">Agent Review</p>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Inbox</h1>
          </div>
          <button
            aria-label="Refresh queue"
            className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-ink"
            onClick={onRefresh}
            type="button"
          >
            <RotateCw size={17} />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-3 rounded-lg border border-gray-200 bg-slate-50 p-1">
          {tabs.map((tab) => {
            const count =
              tab.key === 'notes'
                ? pendingProposals.length
                : tab.key === 'links'
                  ? pendingNoteLinks.length
                  : reviewedProposals.length
            return (
              <button
                className={`rounded-md px-2 py-2 text-xs font-extrabold ${
                  activeTab === tab.key
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-gray-500 hover:text-ink'
                }`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                {tab.label}
                {count ? <span className="ml-1 text-violet">{count}</span> : null}
              </button>
            )
          })}
        </div>

        <div className="mb-3 flex items-center gap-2 text-[12px] font-extrabold text-gray-500">
          {activeTab === 'links' ? <GitBranch size={15} /> : <ListChecks size={15} />}
          {activeTab === 'links'
            ? 'Suggested note links'
            : activeTab === 'done'
              ? 'Reviewed updates'
              : 'Note updates'}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {activeTab === 'links' ? (
            pendingNoteLinks.length ? (
              pendingNoteLinks.map((link) => (
                <article className="rounded-lg border border-gray-200 bg-white p-3" key={link.id}>
                  <p className="line-clamp-2 text-[13px] font-extrabold text-ink">
                    {link.sourceTitle ?? 'New note'} {'->'} {link.targetTitle ?? 'Existing note'}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                    {link.rationale ?? 'Agent detected overlap between these notes.'}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-violet text-[11px] font-bold text-white disabled:opacity-50"
                      disabled={isSubmitting}
                      onClick={() => onApproveNoteLink(link.id)}
                      type="button"
                    >
                      <Check size={13} />
                      Approve
                    </button>
                    <button
                      aria-label="Reject link suggestion"
                      className="grid h-8 w-8 place-items-center rounded-md border border-gray-300 bg-white text-gray-600 disabled:opacity-50"
                      disabled={isSubmitting}
                      onClick={() => onRejectNoteLink(link.id)}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm leading-6 text-gray-500">
                No link suggestions waiting.
              </p>
            )
          ) : activeList.length ? (
            activeList.map((proposal) => {
              const source = proposal.rawNoteId
                ? rawNotes.find((rawNote) => rawNote.id === proposal.rawNoteId)
                : undefined
              return (
                <button
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    proposal.id === selectedProposal?.id
                      ? 'border-violet bg-violet/10'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  key={proposal.id}
                  onClick={() => onSelectProposal(proposal.id)}
                  type="button"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="line-clamp-1 text-[13px] font-extrabold text-ink">
                      {rawNoteTitle(source)}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(proposal.status)}`}>
                      {proposal.status}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-xs font-bold text-gray-500">
                    {summarizeProposal(proposal) || `${proposal.items.length} updates`}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                    {proposal.rationale ?? 'Agent found incremental knowledge updates.'}
                  </p>
                </button>
              )
            })
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm leading-6 text-gray-500">
              {activeTab === 'done' ? 'No reviewed updates yet.' : 'No note updates waiting.'}
            </p>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-gray-200 bg-white px-8 py-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {activeTab === 'links' ? 'Relationship review' : 'Knowledge update review'}
              </p>
              <h2 className="mt-1 truncate text-2xl font-extrabold text-ink">
                {activeTab === 'links'
                  ? 'Approve note-to-note links'
                  : selectedProposal
                    ? rawNoteTitle(sourceRawNote)
                    : 'No update selected'}
              </h2>
              <p className="mt-2 max-w-[760px] text-sm leading-6 text-gray-500">
                {activeTab === 'links'
                  ? 'Links are optional relationship suggestions after content has been applied.'
                  : 'Review the agent proposal, then apply the note updates to compiled knowledge.'}
              </p>
            </div>
            {activeTab !== 'links' && selectedProposal ? (
              <div className="flex shrink-0 gap-2">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-[13px] font-bold text-ink disabled:opacity-50"
                  disabled={isSubmitting || selectedProposal.status !== 'pending'}
                  onClick={() => onRejectProposal(selectedProposal.id)}
                  type="button"
                >
                  <X size={15} />
                  Reject
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
                  disabled={isSubmitting || selectedProposal.status !== 'pending'}
                  onClick={() => onApproveProposal(selectedProposal.id)}
                  type="button"
                >
                  <Check size={15} />
                  Apply note updates
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="mx-8 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mx-8 mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        ) : null}

        {activeTab === 'links' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
            {pendingNoteLinks.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {pendingNoteLinks.map((link) => (
                  <article className="rounded-lg border border-gray-200 bg-white p-4" key={link.id}>
                    <div className="mb-4 grid grid-cols-[1fr_32px_1fr] items-center gap-3">
                      <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-sm font-extrabold text-ink">
                        {link.sourceTitle ?? 'New note'}
                      </p>
                      <ArrowRight className="text-gray-400" size={18} />
                      <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-sm font-extrabold text-ink">
                        {link.targetTitle ?? 'Existing note'}
                      </p>
                    </div>
                    <p className="text-sm leading-6 text-gray-600">
                      {link.rationale ?? 'Agent detected overlap between these notes.'}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet px-3 text-xs font-bold text-white disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => onApproveNoteLink(link.id)}
                        type="button"
                      >
                        <Check size={14} />
                        Approve link
                      </button>
                      <button
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-ink disabled:opacity-50"
                        disabled={isSubmitting}
                        onClick={() => onRejectNoteLink(link.id)}
                        type="button"
                      >
                        <X size={14} />
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState activeTab={activeTab} />
            )}
          </div>
        ) : selectedProposal ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(520px,1fr)_340px]">
            <div className="min-h-0 overflow-y-auto px-8 py-7">
              <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      Agent proposes
                    </p>
                    <h3 className="mt-1 text-lg font-extrabold text-ink">
                      {summarizeProposal(selectedProposal) || `${selectedProposal.items.length} updates`}
                    </h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${statusClass(selectedProposal.status)}`}>
                    {selectedProposal.status}
                  </span>
                </div>
                <p className="text-sm leading-6 text-gray-600">
                  {selectedProposal.rationale ?? 'Agent found incremental knowledge changes from this raw note.'}
                </p>
              </section>

              <div className="space-y-3">
                {selectedProposal.items.map((item) => (
                  <article className="rounded-lg border border-gray-200 bg-white p-4" key={item.id}>
                    <div className="mb-3 flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet/10 text-violet">
                        <FileText size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {itemVerb(item.actionType)} · {actionLabel(item.actionType)}
                        </p>
                        <h4 className="mt-1 text-base font-extrabold text-ink">
                          {payloadLabel(item.payload)}
                        </h4>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    {item.rationale ? (
                      <p className="mb-3 text-sm leading-6 text-gray-600">{item.rationale}</p>
                    ) : null}
                    {payloadText(item.payload, 'bodyMarkdown') ? (
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
                        {payloadText(item.payload, 'bodyMarkdown')}
                      </pre>
                    ) : (
                      <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
                        {payloadText(item.payload, 'rationale', 'This update will be applied after approval.')}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white px-5 py-6">
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-ink">Source raw note</h3>
                <article className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <p className="text-[13px] font-extrabold text-ink">{rawNoteTitle(sourceRawNote)}</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-600">
                    {sourceRawNote?.bodyMarkdown ?? 'The source raw note is no longer available.'}
                  </p>
                </article>
              </section>

              <section className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                <p className="text-[12px] font-extrabold text-ink">Approval model</p>
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  Apply confirms content updates first. Relationship links are reviewed separately in the Links tab.
                </p>
              </section>
            </aside>
          </div>
        ) : (
          <EmptyState activeTab={activeTab} />
        )}
      </main>
    </section>
  )
}
