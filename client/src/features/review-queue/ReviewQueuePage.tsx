import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  Layers3,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react'
import { actionLabel, payloadLabel, payloadText } from '../../lib/knowledge'
import type { NoteLink, Proposal, ProposalItem, RawNote, RawSource } from '../../types/domain'

type ReviewTab = 'updates' | 'links' | 'done'

const tabs: Array<{ key: ReviewTab; label: string }> = [
  { key: 'updates', label: 'Updates' },
  { key: 'links', label: 'Links' },
  { key: 'done', label: 'Done' },
]

function statusClass(status: string) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-violet/30 bg-violet/10 text-violet'
}

function sourceTitle(rawNote: RawNote | undefined, rawSource: RawSource | undefined) {
  return rawSource?.title ?? rawNote?.title ?? 'Untitled source'
}

function sourceRoleLabel(role: string | undefined) {
  return role === 'reference' ? 'Reference' : 'Personal note'
}

function sourceTypeLabel(type: string | undefined) {
  if (!type) return 'markdown'
  return type.replaceAll('_', ' ')
}

function proposalRawNote(proposal: Proposal | null, rawNotes: RawNote[]) {
  return proposal?.rawNoteId ? rawNotes.find((rawNote) => rawNote.id === proposal.rawNoteId) : undefined
}

function proposalRawSource(proposal: Proposal | null, rawNote: RawNote | undefined, rawSources: RawSource[]) {
  const rawSourceId =
    rawNote?.rawSourceId ??
    proposal?.items
      .map((item) => item.payload.structuredData)
      .find((structuredData): structuredData is { rawSourceId: string } =>
        Boolean(
          structuredData &&
            typeof structuredData === 'object' &&
            !Array.isArray(structuredData) &&
            typeof (structuredData as { rawSourceId?: unknown }).rawSourceId === 'string',
        ),
      )?.rawSourceId

  return rawSourceId ? rawSources.find((rawSource) => rawSource.id === rawSourceId) : undefined
}

function proposalLifecycle(proposal: Proposal | null) {
  if (!proposal) return 'No proposal'
  if (proposal.status === 'pending') return 'Needs approval'
  if (proposal.status === 'approved') return 'Applied'
  return 'Rejected'
}

function itemVerb(actionType: string) {
  if (actionType === 'upsert_knowledge') return 'Knowledge'
  if (actionType === 'create_link') return 'Link'
  if (actionType === 'upsert_compiled_note') return 'Knowledge'
  return 'Update'
}

function summarizeProposal(proposal: Proposal) {
  const updates = proposal.items.filter((item) =>
    ['upsert_knowledge', 'upsert_compiled_note'].includes(item.actionType),
  ).length
  const links = proposal.items.filter((item) => item.actionType === 'create_link').length
  const other = proposal.items.length - updates - links
  return [
    updates ? `${updates} update${updates > 1 ? 's' : ''}` : null,
    links ? `${links} link${links > 1 ? 's' : ''}` : null,
    other ? `${other} other` : null,
  ].filter(Boolean).join(' · ')
}

function proposalGroups(proposal: Proposal) {
  return [
    {
      actionTypes: ['upsert_knowledge', 'upsert_compiled_note'],
      label: 'Updates',
      description: 'Approved knowledge to create or update.',
      icon: FileText,
    },
    {
      actionTypes: ['create_link'],
      label: 'Links',
      description: 'Relationship suggestions created after the update is applied.',
      icon: GitBranch,
    },
    {
      actionTypes: proposal.items
        .filter((item) => !['upsert_knowledge', 'upsert_compiled_note', 'create_link'].includes(item.actionType))
        .map((item) => item.actionType),
      label: 'Legacy items',
      description: 'Older proposal items kept read-only for compatibility.',
      icon: FileText,
    },
  ]
    .map((group) => ({
      ...group,
      items: proposal.items.filter((item) => group.actionTypes.includes(item.actionType)),
    }))
    .filter((group) => group.items.length > 0)
}

function knowledgeItems(proposal: Proposal) {
  return proposal.items.filter((item) =>
    ['upsert_knowledge', 'upsert_compiled_note'].includes(item.actionType),
  )
}

function linkItems(proposal: Proposal) {
  return proposal.items.filter((item) => item.actionType === 'create_link')
}

function MetadataPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600">
      {children}
    </span>
  )
}

function KnowledgeUpdateCard({ item }: { item: ProposalItem }) {
  const body = payloadText(item.payload, 'bodyMarkdown')
  const knowledgeType = payloadText(item.payload, 'knowledgeType', 'knowledge')
  const domain = payloadText(item.payload, 'domain')

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
            {actionLabel(item.actionType)}
          </p>
          <h4 className="mt-1 line-clamp-2 text-base font-extrabold text-ink">
            {payloadLabel(item.payload)}
          </h4>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(item.status)}`}>
          {item.status}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <MetadataPill>{knowledgeType}</MetadataPill>
        {domain ? <MetadataPill>{domain}</MetadataPill> : null}
      </div>
      {item.rationale ? (
        <p className="mb-3 text-sm leading-6 text-gray-600">{item.rationale}</p>
      ) : null}
      {body ? (
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
          {body}
        </pre>
      ) : (
        <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
          This knowledge note will be created or updated after approval.
        </p>
      )}
    </article>
  )
}

function EmptyState({ activeTab }: { activeTab: ReviewTab }) {
  const copy =
    activeTab === 'links'
      ? 'No link suggestions waiting. Links appear after updates are applied.'
      : activeTab === 'done'
        ? 'No reviewed updates yet.'
        : 'No updates waiting. Capture and compile a source to start.'

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
  rawSources,
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
  rawSources: RawSource[]
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
  const [activeTab, setActiveTab] = useState<ReviewTab>('updates')
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false)
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
  const activeList = activeTab === 'done' ? reviewedProposals : pendingProposals
  const selectedProposal =
    activeList.find((proposal) => proposal.id === selectedProposalId) ??
    activeList[0] ??
    null
  const sourceRawNote = proposalRawNote(selectedProposal, rawNotes)
  const sourceRawSource = proposalRawSource(selectedProposal, sourceRawNote, rawSources)
  const sourceChunks = sourceRawSource?.chunks ?? []
  const selectedKnowledgeItems = selectedProposal ? knowledgeItems(selectedProposal) : []
  const selectedLinkItems = selectedProposal ? linkItems(selectedProposal) : []

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
              tab.key === 'updates'
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
          {activeTab === 'links' ? <GitBranch size={15} /> : <FileText size={15} />}
          {activeTab === 'links'
            ? 'Suggested note links'
            : activeTab === 'done'
              ? 'Reviewed updates'
              : 'Knowledge updates'}
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
              const rawSource = proposalRawSource(proposal, source, rawSources)
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
                      {sourceTitle(source, rawSource)}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(proposal.status)}`}>
                      {proposal.status}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-xs font-bold text-gray-500">
                    {summarizeProposal(proposal) || `${proposal.items.length} updates`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                      {sourceRoleLabel(rawSource?.sourceRole ?? source?.sourceRole)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                      {rawSource?.chunks.length ?? 0} chunks
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                    {proposal.rationale ?? 'Agent found incremental knowledge updates.'}
                  </p>
                </button>
              )
            })
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm leading-6 text-gray-500">
              {activeTab === 'done' ? 'No reviewed updates yet.' : 'No updates waiting.'}
            </p>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-gray-200 bg-white px-8 py-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {activeTab === 'links' ? 'Relationship review' : 'Update review'}
              </p>
              <h2 className="mt-1 truncate text-2xl font-extrabold text-ink">
                {activeTab === 'links'
                  ? 'Approve note-to-note links'
                  : selectedProposal
                    ? sourceTitle(sourceRawNote, sourceRawSource)
                    : 'No update selected'}
              </h2>
              <p className="mt-2 max-w-[760px] text-sm leading-6 text-gray-500">
                {activeTab === 'links'
                  ? 'Links are optional relationship suggestions after content has been applied.'
                  : 'Confirm source evidence, inspect the proposed knowledge update, then apply it.'}
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
                  Apply updates
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
              <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      Review this proposed update
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
                  {selectedProposal.rationale ?? 'Agent found incremental knowledge changes from this source.'}
                </p>
              </section>

              <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      Suggested knowledge update
                    </p>
                    <h3 className="mt-1 text-lg font-extrabold text-ink">
                      {selectedKnowledgeItems.length} note{selectedKnowledgeItems.length === 1 ? '' : 's'} to apply
                    </h3>
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet/10 text-violet">
                    <FileText size={17} />
                  </span>
                </div>
                {selectedKnowledgeItems.length ? (
                  <div className="space-y-3">
                    {selectedKnowledgeItems.map((item) => (
                      <KnowledgeUpdateCard item={item} key={item.id} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-gray-300 bg-slate-50 p-4 text-sm leading-6 text-gray-500">
                    This proposal does not contain a knowledge note update.
                  </p>
                )}
              </section>

              <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      Relationship suggestions
                    </p>
                    <h3 className="mt-1 text-lg font-extrabold text-ink">
                      {selectedLinkItems.length} link{selectedLinkItems.length === 1 ? '' : 's'}
                    </h3>
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-gray-600">
                    <GitBranch size={17} />
                  </span>
                </div>
                {selectedLinkItems.length ? (
                  <div className="space-y-2">
                    {selectedLinkItems.map((item) => (
                      <p
                        className="line-clamp-2 rounded-md border border-gray-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-gray-700"
                        key={item.id}
                      >
                        {payloadLabel(item.payload)} · {item.rationale ?? 'Related knowledge suggested by the agent.'}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-gray-500">
                    No relationship links are bundled with this update. Links can still appear later in the Links tab.
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-gray-200 bg-white">
                <button
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setShowAdvancedDetails((current) => !current)}
                  type="button"
                >
                  <div>
                    <p className="text-sm font-extrabold text-ink">Advanced details</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Inspect each proposal item before applying this update.
                    </p>
                  </div>
                  <ChevronDown
                    className={`shrink-0 text-gray-500 transition ${showAdvancedDetails ? 'rotate-180' : ''}`}
                    size={18}
                  />
                </button>

                {showAdvancedDetails ? (
                  <div className="space-y-3 border-t border-gray-200 p-4">
                    {selectedProposal.items.map((item) => (
                      <article className="rounded-lg border border-gray-200 bg-slate-50 p-4" key={item.id}>
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
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-xs leading-5 text-gray-600">
                            {payloadText(item.payload, 'bodyMarkdown')}
                          </pre>
                        ) : (
                          <p className="rounded-lg border border-gray-200 bg-white p-3 text-xs leading-5 text-gray-600">
                            {payloadText(item.payload, 'rationale', 'This update will be applied after approval.')}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>

            <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white px-5 py-6">
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-ink">Source evidence</h3>
                <article className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-violet">
                      {sourceRawSource?.sourceRole === 'reference' ? <BookOpen size={17} /> : <FileText size={17} />}
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[13px] font-extrabold text-ink">
                        {sourceTitle(sourceRawNote, sourceRawSource)}
                      </p>
                      <p className="mt-1 text-[11px] font-bold uppercase text-gray-500">
                        {proposalLifecycle(selectedProposal)}
                      </p>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <MetadataPill>{sourceRoleLabel(sourceRawSource?.sourceRole ?? sourceRawNote?.sourceRole)}</MetadataPill>
                    <MetadataPill>{sourceTypeLabel(sourceRawSource?.sourceType ?? sourceRawNote?.sourceType)}</MetadataPill>
                    <MetadataPill>{sourceChunks.length} chunks</MetadataPill>
                  </div>
                  <p className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-xs leading-5 text-gray-600">
                    {sourceRawSource?.bodyMarkdown ??
                      sourceRawNote?.bodyMarkdown ??
                      'The source text is no longer available.'}
                  </p>
                </article>
              </section>

              <section className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <Layers3 size={15} className="text-gray-500" />
                  <h3 className="text-sm font-extrabold text-ink">Evidence chunks</h3>
                </div>
                {sourceChunks.length ? (
                  <div className="space-y-2">
                    {sourceChunks.map((chunk) => (
                      <article className="rounded-lg border border-gray-200 bg-slate-50 p-3" key={chunk.id}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="line-clamp-1 text-xs font-extrabold text-ink">
                            {chunk.heading ?? `Chunk ${chunk.chunkIndex + 1}`}
                          </p>
                          <span className="shrink-0 text-[10px] font-bold uppercase text-gray-500">
                            #{chunk.chunkIndex + 1} · ~{chunk.tokenEstimate}
                          </span>
                        </div>
                        <p className="line-clamp-4 text-xs leading-5 text-gray-600">
                          {chunk.bodyMarkdown}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-gray-300 bg-slate-50 p-4 text-xs leading-5 text-gray-500">
                    No source chunks are linked to this proposal yet.
                  </p>
                )}
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
