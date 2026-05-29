import { ExternalLink, RotateCw, X } from 'lucide-react'
import { isRecord } from '../../lib/knowledge'
import type { AgentRunDetail, WorkspaceData } from '../../types/domain'
import {
  agentRunLabel,
  agentRunOutputText,
  compactJson,
  eventLabel,
  relationOptionLabel,
  shortTimestamp,
} from './agentRunView'

export function AgentRunDrawer({
  detail,
  data,
  isLoading,
  onClose,
  onOpenProposal,
  onRetry,
}: {
  detail: AgentRunDetail | null
  data: WorkspaceData
  isLoading: boolean
  onClose: () => void
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
}) {
  const agentRun = detail?.agentRun ?? null
  const output = isRecord(agentRun?.output) ? agentRun.output : {}
  const generatedProposalId =
    typeof output.proposalId === 'string' ? output.proposalId : null
  const generatedProposal = generatedProposalId
    ? data.proposals.find((proposal) => proposal.id === generatedProposalId) ?? null
    : null
  const generatedLinks = agentRun
    ? data.noteLinks.filter((link) => link.createdByAgentRunId === agentRun.id)
    : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button
        aria-label="Close agent run detail"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside className="relative z-10 flex h-full w-[430px] flex-col border-l border-[#303030] bg-[#181818] text-white shadow-2xl">
        <header className="border-b border-[#303030] px-6 py-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet">
                Agent run
              </p>
              <h2 className="mt-1 text-xl font-extrabold capitalize text-white">
                {agentRun ? agentRunLabel(agentRun.runType) : 'Loading run'}
              </h2>
            </div>
            <button
              aria-label="Close agent run detail"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[#303030] text-gray-400 hover:border-gray-500 hover:text-white"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Status', agentRun?.status ?? (isLoading ? 'loading' : 'missing')],
              ['Events', detail?.events.length ?? 0],
              ['Started', shortTimestamp(agentRun?.startedAt ?? null)],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-[#303030] bg-[#202020] p-2" key={label}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
                <p className="mt-1 truncate text-xs font-extrabold uppercase text-gray-100">{value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <p className="rounded-lg border border-[#303030] bg-[#202020] p-4 text-sm text-gray-400">
              Loading agent run details...
            </p>
          ) : null}

          {!isLoading && !agentRun ? (
            <p className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-100">
              Agent run not found.
            </p>
          ) : null}

          {agentRun ? (
            <>
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-gray-100">Summary</h3>
                <div className="rounded-lg border border-[#303030] bg-[#202020] p-4">
                  <p className="text-sm leading-6 text-gray-300">{agentRunOutputText(agentRun)}</p>
                  {agentRun.error ? (
                    <p className="mt-3 rounded-md border border-red-900/60 bg-red-950/40 p-3 text-xs leading-5 text-red-100">
                      {agentRun.error}
                    </p>
                  ) : null}
                  {agentRun.status === 'failed' ? (
                    <button
                      className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-violet px-3 text-xs font-bold text-white hover:bg-violet-dark"
                      onClick={() => onRetry(agentRun.id)}
                      type="button"
                    >
                      <RotateCw size={14} />
                      Retry run
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-gray-100">Timeline</h3>
                <div className="space-y-2">
                  {detail?.events.length ? (
                    detail.events.map((event) => (
                      <article className="rounded-lg border border-[#303030] bg-[#202020] p-3" key={event.id}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-[13px] font-extrabold capitalize text-white">
                            {eventLabel(event.eventType)}
                          </p>
                          <span className="text-[11px] font-semibold text-gray-500">
                            {shortTimestamp(event.createdAt)}
                          </span>
                        </div>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-[#141414] p-2 text-[11px] leading-5 text-gray-400">
                          {compactJson(event.payload)}
                        </pre>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No timeline events recorded yet.
                    </p>
                  )}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-gray-100">Generated proposal</h3>
                {generatedProposal ? (
                  <article className="rounded-lg border border-violet/30 bg-violet/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-[13px] font-extrabold capitalize text-white">
                        {generatedProposal.detectedKnowledgeType ?? 'Knowledge update'}
                      </p>
                      <span className="rounded-full border border-violet/30 px-2 py-0.5 text-[10px] font-bold uppercase text-violet">
                        {generatedProposal.status}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-gray-300">
                      {generatedProposal.rationale ?? 'Proposal generated by this run.'}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold text-gray-500">
                      {generatedProposal.items.length} suggested updates
                    </p>
                    <button
                      className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-violet px-3 text-xs font-bold text-white hover:bg-violet-dark"
                      onClick={() => onOpenProposal(generatedProposal.id)}
                      type="button"
                    >
                      <ExternalLink size={14} />
                      Open in Review Inbox
                    </button>
                  </article>
                ) : (
                  <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                    This run did not report a proposal id.
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-3 text-sm font-extrabold text-gray-100">Generated links</h3>
                <div className="space-y-2">
                  {generatedLinks.length ? (
                    generatedLinks.map((link) => (
                      <article className="rounded-lg border border-[#303030] bg-[#202020] p-3" key={link.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="line-clamp-1 text-[13px] font-extrabold text-white">
                              {link.sourceTitle ?? 'Note'} {'->'} {link.targetTitle ?? 'Note'}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-gray-400">
                              {link.rationale ?? relationOptionLabel(link.relationType)}
                            </p>
                          </div>
                          <span className="rounded-full border border-[#3A3A3A] px-2 py-0.5 text-[10px] font-bold uppercase text-gray-300">
                            {link.status}
                          </span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No generated note links are attached to this run.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
