import { Check, Link2, X } from 'lucide-react'
import { actionLabel, payloadLabel, payloadText } from '../lib/knowledge'
import type { Proposal } from '../types/domain'

export function ProposalInspector({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: Proposal | null
  onApprove: (proposalId: string) => void
  onReject: (proposalId: string) => void
}) {
  const firstItem = proposal?.items[0]

  return (
    <aside className="h-full w-[360px] shrink-0 overflow-y-auto border-l border-gray-300 bg-white px-[18px] py-5">
      <div className="mb-4 space-y-1">
        <p className="text-[11px] font-bold tracking-wide text-violet">AI UPDATE PROPOSAL</p>
        <h2 className="text-xl font-extrabold text-ink">Compile raw note into knowledge</h2>
        <p className="text-xs leading-5 text-gray-500">
          {proposal
            ? `Detected ${proposal.detectedKnowledgeType ?? 'coding note'} · ${proposal.confidence} confidence`
            : 'No pending proposal selected'}
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-slate-50 p-3.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-gray-500">Domain</span>
          <strong className="text-[13px] text-ink">{proposal?.detectedDomain ?? 'Coding'}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-gray-500">Impact</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
            Level {proposal?.impactLevel ?? 2} · approval recommended
          </span>
        </div>
      </div>

      <section className="mb-4 space-y-2.5">
        <h3 className="text-sm font-extrabold text-ink">Suggested updates</h3>
        {proposal?.items.length ? (
          proposal.items.map((item, index) => (
            <article className="rounded-md border border-gray-200 bg-white p-3" key={item.id}>
              <p className="text-[13px] font-bold capitalize text-ink">
                {index + 1}. {actionLabel(item.actionType)}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-600">{payloadLabel(item.payload)}</p>
            </article>
          ))
        ) : (
          <p className="rounded-md border border-gray-200 bg-white p-3 text-xs leading-5 text-gray-500">
            Capture a raw note to generate a proposal.
          </p>
        )}
      </section>

      <section className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3.5">
        <h3 className="mb-2 text-[13px] font-extrabold text-indigo-800">Why</h3>
        <p className="text-xs leading-5 text-indigo-800">
          {proposal?.rationale ??
            'The compiler turns messy practice notes into clean, evidence-backed knowledge changes.'}
        </p>
      </section>

      <section className="mb-4 rounded-lg border border-gray-200 bg-slate-50 p-3.5">
        <h3 className="mb-2 text-[13px] font-extrabold text-ink">Readiness change</h3>
        <p className="text-xs leading-5 text-gray-600">
          {firstItem
            ? payloadText(firstItem.payload, 'rationale', 'Readiness updates remain linked to source evidence.')
            : 'Graph shortest path remains Weak until review tasks are completed.'}
        </p>
      </section>

      <section className="mb-4 space-y-2">
        <h3 className="text-sm font-extrabold text-ink">Evidence links</h3>
        {['Raw note · today', 'Shortest Path review map'].map((label) => (
          <div className="flex h-[38px] items-center gap-2 rounded-md border border-gray-200 px-2.5 text-xs text-gray-700" key={label}>
            <Link2 size={15} className="text-gray-500" />
            {label}
          </div>
        ))}
      </section>

      <div className="flex gap-2.5">
        <button
          className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-[13px] font-bold text-ink disabled:opacity-50"
          disabled={!proposal || proposal.status !== 'pending'}
          onClick={() => proposal && onReject(proposal.id)}
          type="button"
        >
          <X size={15} />
          Reject
        </button>
        <button
          className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-violet text-[13px] font-extrabold text-white disabled:opacity-50"
          disabled={!proposal || proposal.status !== 'pending'}
          onClick={() => proposal && onApprove(proposal.id)}
          type="button"
        >
          <Check size={15} />
          Approve
        </button>
      </div>
    </aside>
  )
}
