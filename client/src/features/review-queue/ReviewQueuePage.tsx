import { Check, GitBranch, Link2, ListChecks, RotateCw, Sparkles, X } from 'lucide-react'
import { actionLabel, payloadLabel, payloadText } from '../../lib/knowledge'
import type { NoteLink, Proposal, RawNote } from '../../types/domain'

function statusClass(status: string) {
  if (status === 'approved') return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-violet/30 bg-violet/10 text-violet'
}

function rawNoteTitle(rawNote: RawNote | undefined) {
  return rawNote?.title ?? 'Untitled raw note'
}

function flowSteps(proposal: Proposal | null) {
  const status = proposal?.status ?? 'pending'
  return [
    { label: 'Raw note captured', done: Boolean(proposal?.rawNoteId), active: false },
    { label: 'Wiki index detected updates', done: Boolean(proposal), active: !proposal },
    {
      label: status === 'pending' ? 'Waiting for your approval' : 'Approval reviewed',
      done: status !== 'pending',
      active: status === 'pending',
    },
    { label: 'Compiled knowledge updated', done: status === 'approved', active: false },
  ]
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
  const pendingProposals = proposals.filter((proposal) => proposal.status === 'pending')
  const recentlyReviewed = proposals.filter((proposal) => proposal.status !== 'pending').slice(0, 8)
  const selectedProposal =
    proposals.find((proposal) => proposal.id === selectedProposalId) ??
    pendingProposals[0] ??
    proposals[0] ??
    null
  const sourceRawNote = selectedProposal?.rawNoteId
    ? rawNotes.find((rawNote) => rawNote.id === selectedProposal.rawNoteId)
    : undefined
  const pendingNoteLinks = noteLinks.filter((link) => link.status === 'pending')
  const approvedTodayCount = proposals.filter((proposal) => proposal.status === 'approved').length
  const steps = flowSteps(selectedProposal)

  return (
    <section className="flex min-h-0 flex-1 bg-canvas text-ink">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-gray-200 bg-white px-5 py-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet">Review Queue</p>
            <h1 className="mt-1 text-2xl font-extrabold text-ink">Today&apos;s updates</h1>
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

        <div className="mb-5 grid grid-cols-3 gap-2">
          {[
            ['Pending', pendingProposals.length],
            ['Applied', approvedTodayCount],
            ['Links', pendingNoteLinks.length],
          ].map(([label, value]) => (
            <div className="rounded-lg border border-gray-200 bg-slate-50 p-2.5" key={label}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-1 text-xl font-extrabold text-ink">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2 text-[12px] font-extrabold text-gray-500">
          <ListChecks size={15} />
          Needs approval
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {pendingProposals.length ? (
            pendingProposals.map((proposal) => (
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
                    {proposal.detectedKnowledgeType ?? 'Knowledge update'}
                  </p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(proposal.status)}`}>
                    {proposal.status}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-gray-600">
                  {proposal.rationale ?? 'Agent found incremental updates from this raw note.'}
                </p>
                <p className="mt-2 text-[11px] font-bold text-gray-400">
                  {proposal.items.length} changes from {rawNoteTitle(rawNotes.find((note) => note.id === proposal.rawNoteId))}
                </p>
              </button>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm leading-6 text-gray-500">
              No pending proposals. Capture and compile a raw note to create the next review.
            </p>
          )}

          {recentlyReviewed.length ? (
            <div className="pt-4">
              <p className="mb-2 text-[12px] font-extrabold text-gray-500">Recently reviewed</p>
              <div className="space-y-2">
                {recentlyReviewed.map((proposal) => (
                  <button
                    className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-300"
                    key={proposal.id}
                    onClick={() => onSelectProposal(proposal.id)}
                    type="button"
                  >
                    <p className="line-clamp-1 text-[13px] font-bold text-ink">
                      {proposal.detectedKnowledgeType ?? 'Knowledge update'}
                    </p>
                    <p className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(proposal.status)}`}>
                      {proposal.status}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-gray-200 bg-white px-8 py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Raw note to knowledge
              </p>
              <h2 className="mt-1 truncate text-2xl font-extrabold text-ink">
                {selectedProposal
                  ? rawNoteTitle(sourceRawNote)
                  : 'Compile a note to start the incremental flow'}
              </h2>
              <p className="mt-2 max-w-[780px] text-sm leading-6 text-gray-500">
                The agent turns the raw note into indexed wiki concepts, proposes updates, and only writes compiled knowledge after approval.
              </p>
            </div>
            {selectedProposal ? (
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
                  Apply updates
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-3">
            {steps.map((step, index) => (
              <div
                className={`rounded-lg border p-3 ${
                  step.done
                    ? 'border-emerald-200 bg-emerald-50'
                    : step.active
                      ? 'border-violet/40 bg-violet/10'
                      : 'border-gray-200 bg-slate-50'
                }`}
                key={step.label}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Step {index + 1}
                </p>
                <p className="mt-1 text-sm font-extrabold text-ink">{step.label}</p>
              </div>
            ))}
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

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(520px,1fr)_360px] gap-0">
          <div className="min-h-0 overflow-y-auto px-8 py-7">
            {selectedProposal ? (
              <>
                <section className="mb-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles size={16} className="text-violet" />
                    <h3 className="text-base font-extrabold text-ink">Proposed knowledge changes</h3>
                  </div>
                  <div className="space-y-3">
                    {selectedProposal.items.map((item, index) => (
                      <article className="rounded-lg border border-gray-200 bg-white p-4" key={item.id}>
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
                              {index + 1}. {actionLabel(item.actionType)}
                            </p>
                            <h4 className="mt-1 text-lg font-extrabold text-ink">{payloadLabel(item.payload)}</h4>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${statusClass(item.status)}`}>
                            {item.status}
                          </span>
                        </div>
                        {item.rationale ? (
                          <p className="mb-3 text-sm leading-6 text-gray-600">{item.rationale}</p>
                        ) : null}
                        {payloadText(item.payload, 'bodyMarkdown') ? (
                          <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
                            {payloadText(item.payload, 'bodyMarkdown')}
                          </pre>
                        ) : (
                          <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
                            {payloadText(item.payload, 'rationale', 'This update will be applied to the compiled knowledge store after approval.')}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Link2 size={16} className="text-violet" />
                    <h3 className="text-base font-extrabold text-ink">Source evidence</h3>
                  </div>
                  <article className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-[13px] font-extrabold text-ink">{rawNoteTitle(sourceRawNote)}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                      {sourceRawNote?.bodyMarkdown ?? 'The source raw note is no longer available.'}
                    </p>
                  </article>
                </section>
              </>
            ) : (
              <div className="grid h-full place-items-center">
                <div className="max-w-[460px] rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
                  <Sparkles className="mx-auto mb-4 text-violet" size={34} />
                  <h3 className="text-lg font-extrabold text-ink">No proposal selected</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-500">
                    Compile a raw note and the queue will show what the agent wants to change before anything is written.
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white px-5 py-6">
            <section className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-ink">
                <GitBranch size={15} className="text-violet" />
                Incremental link suggestions
              </h3>
              <div className="space-y-2">
                {pendingNoteLinks.length ? (
                  pendingNoteLinks.map((link) => (
                    <article className="rounded-lg border border-violet/30 bg-violet/10 p-3" key={link.id}>
                      <p className="line-clamp-2 text-[13px] font-extrabold text-ink">
                        {link.sourceTitle ?? 'New note'} {'->'} {link.targetTitle ?? 'Existing note'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-600">
                        {link.rationale ?? 'Agent found overlap while applying approved knowledge.'}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded-md bg-violet px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                          disabled={isSubmitting}
                          onClick={() => onApproveNoteLink(link.id)}
                          type="button"
                        >
                          <Check size={13} />
                          Approve
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 disabled:opacity-50"
                          disabled={isSubmitting}
                          onClick={() => onRejectNoteLink(link.id)}
                          type="button"
                        >
                          <X size={13} />
                          Reject
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-500">
                    After applying a proposal, related-note links may appear here for approval.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-slate-50 p-4">
              <p className="text-[12px] font-extrabold text-ink">What happens after Apply?</p>
              <p className="mt-2 text-xs leading-5 text-gray-600">
                The server writes compiled notes, evidence links, concept index entries, readiness changes, and any agent-detected note links as approval-gated suggestions.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </section>
  )
}
