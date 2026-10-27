import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Layers3,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react'
import { Banner, Pill, pluralize, useDialog, type Tone } from '../../components/ui'
import { actionLabel, payloadLabel, payloadText } from '../../lib/knowledge'
import type { CompiledNote, Proposal, ProposalItem, RawSource } from '../../types/domain'

type ReviewTab = 'updates' | 'done'
type IndexingOutcomeOverride = 'keep_searchable' | 'create_knowledge'
type IndexingRecommendation = {
  outcome: 'keep_searchable' | 'create_knowledge' | 'update_existing_knowledge'
  reason: string
}

const tabs: Array<{ key: ReviewTab; label: string }> = [
  { key: 'updates', label: 'To review' },
  { key: 'done', label: 'Reviewed' },
]

function statusTone(status: string): Tone {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'accent'
}

function conflictResolutionLabel(resolution: ProposalItem['conflictResolution']): {
  label: string
  tone: Tone
} | null {
  if (resolution === 'update') {
    return { tone: 'info', label: 'Will update existing block' }
  }
  if (resolution === 'keep_both') {
    return { tone: 'neutral', label: 'Will create alongside existing block' }
  }
  if (resolution === 'needs_user_decision') {
    return { tone: 'warning', label: 'Needs your decision' }
  }
  return null
}

function evalBadge(item: ProposalItem) {
  if (item.evalVerdict === 'pass') {
    return { tone: 'success' as Tone, icon: CheckCircle2, label: 'Grounded' }
  }
  if (item.evalVerdict === 'warn') {
    return { tone: 'warning' as Tone, icon: AlertTriangle, label: 'Check warning' }
  }
  if (item.evalVerdict === 'fail') {
    return { tone: 'danger' as Tone, icon: AlertTriangle, label: 'Check failed' }
  }
  return null
}

function itemRequiresAcknowledgement(item: ProposalItem) {
  return item.conflictResolution === 'needs_user_decision' || item.evalVerdict === 'fail'
}

function sourceTitle(rawSource: RawSource | undefined) {
  return rawSource?.title ?? 'Untitled source'
}

function sourceRoleLabel(role: string | undefined) {
  return role === 'reference' ? 'Reference' : 'Personal note'
}

function sourceTypeLabel(type: string | undefined) {
  if (!type) return 'markdown'
  return type.replaceAll('_', ' ')
}

function proposalRawSource(proposal: Proposal | null, rawSources: RawSource[]) {
  const rawSourceId =
    proposal?.rawSourceId ??
    proposal?.items
      .map((item) => item.payload)
      .find((payload): payload is { rawSourceId: string } =>
        typeof payload.rawSourceId === 'string',
      )?.rawSourceId ??
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

type InferredSuggestion = {
  text: string
  reason: string
  confidence: string
}

function inferredSuggestions(item: ProposalItem): InferredSuggestion[] {
  const structuredData = item.payload.structuredData
  if (!structuredData || typeof structuredData !== 'object' || Array.isArray(structuredData)) return []
  const suggestions = (structuredData as { inferredSuggestions?: unknown }).inferredSuggestions
  if (!Array.isArray(suggestions)) return []
  return suggestions.flatMap((suggestion) => {
    if (!suggestion || typeof suggestion !== 'object' || Array.isArray(suggestion)) return []
    const record = suggestion as Record<string, unknown>
    return typeof record.text === 'string' && record.text.trim()
      ? [{
          text: record.text,
          reason: typeof record.reason === 'string' ? record.reason : '',
          confidence: typeof record.confidence === 'string' ? record.confidence : 'low',
        }]
      : []
  })
}

function proposalLifecycle(proposal: Proposal | null) {
  if (!proposal) return 'No proposal'
  if (proposal.status === 'pending') return 'Needs approval'
  if (proposal.status === 'approved') return 'Applied'
  return 'Rejected'
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function indexingRecommendation(proposal: Proposal): IndexingRecommendation {
  const itemWithOutcome = proposal.items.find((item) => {
    const payload = recordValue(item.payload)
    return ['keep_searchable', 'create_knowledge', 'update_existing_knowledge'].includes(stringValue(payload, 'outcome'))
  })
  const payload = recordValue(itemWithOutcome?.payload)
  const outcome = stringValue(payload, 'outcome')
  return {
    outcome: outcome === 'keep_searchable' || outcome === 'update_existing_knowledge'
      ? outcome
      : 'create_knowledge',
    reason: stringValue(payload, 'outcomeReason') || proposal.rationale || 'Agent recommendation is ready for review.',
  }
}

function recommendationLabel(outcome: IndexingRecommendation['outcome']) {
  if (outcome === 'keep_searchable') return 'Keep searchable'
  if (outcome === 'update_existing_knowledge') return 'Update existing knowledge'
  return 'Create knowledge note'
}

function itemVerb(actionType: string) {
  if (actionType === 'upsert_knowledge') return 'Knowledge'
  if (actionType === 'upsert_compiled_note') return 'Knowledge'
  if (actionType === 'keep_source_searchable') return 'Source'
  return 'Update'
}

function summarizeProposal(proposal: Proposal) {
  const updates = proposal.items.filter((item) =>
    ['upsert_knowledge', 'upsert_compiled_note'].includes(item.actionType),
  ).length
  const sourceOnly = proposal.items.filter((item) => item.actionType === 'keep_source_searchable').length
  const other = proposal.items.length - updates
  return [
    sourceOnly ? 'source-only' : null,
    updates ? `${updates} update${updates > 1 ? 's' : ''}` : null,
    other - sourceOnly > 0 ? `${other - sourceOnly} other` : null,
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
      actionTypes: proposal.items
        .filter((item) => !['upsert_knowledge', 'upsert_compiled_note'].includes(item.actionType))
        .map((item) => item.actionType),
      label: 'Source-only',
      description: 'Sources to keep searchable without creating knowledge.',
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

function MetadataPill({ children }: { children: ReactNode }) {
  return <Pill className="bg-surface">{children}</Pill>
}

function RecommendationCard({ recommendation }: { recommendation: IndexingRecommendation }) {
  const isSourceOnly = recommendation.outcome === 'keep_searchable'
  const willDo = isSourceOnly
    ? [
        'Make the source searchable',
        'Keep the source in Sources',
        'Not create a knowledge note',
      ]
    : [
        recommendation.outcome === 'update_existing_knowledge'
          ? 'Update existing knowledge'
          : 'Create a knowledge note',
        'Create searchable knowledge blocks',
        'Attach source evidence',
      ]

  return (
    <section className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
      <h3 className="text-sm font-extrabold text-blue-950">
        Recommended: {recommendationLabel(recommendation.outcome)}
      </h3>
      <p className="mt-2 text-sm leading-6 text-blue-950">{recommendation.reason}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {willDo.map((item) => (
          <li
            className="flex items-start gap-2 rounded-md border border-blue-100 bg-surface/70 px-3 py-2 text-xs font-semibold leading-5 text-blue-950"
            key={item}
          >
            <Check aria-hidden size={13} className="mt-0.5 shrink-0 text-blue-700" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ProposalItemBadges({ item }: { item: ProposalItem }) {
  const resolution = conflictResolutionLabel(item.conflictResolution)
  const verdict = evalBadge(item)
  const VerdictIcon = verdict?.icon

  return (
    <div className="flex flex-wrap gap-2">
      {item.conflictDetected ? (
        <Pill tone="warning">
          <AlertTriangle aria-hidden size={12} />
          Conflict detected
        </Pill>
      ) : null}
      {resolution ? <Pill tone={resolution.tone}>{resolution.label}</Pill> : null}
      {verdict && VerdictIcon ? (
        <Pill tone={verdict.tone}>
          <VerdictIcon aria-hidden size={12} />
          {verdict.label}
        </Pill>
      ) : null}
    </div>
  )
}

function ProposalItemWarnings({ item }: { item: ProposalItem }) {
  const shouldShowEvalDetails = item.evalVerdict === 'warn' || item.evalVerdict === 'fail'
  const shouldShowConflictDetails = item.conflictDetected && item.conflictSummary

  if (!shouldShowEvalDetails && !shouldShowConflictDetails && !item.incompleteReasoning) {
    return null
  }

  return (
    <div className="mt-3 space-y-2">
      {shouldShowConflictDetails ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">Conflict summary</p>
          <p className="mt-1 text-xs leading-5 text-amber-900">{item.conflictSummary}</p>
        </div>
      ) : null}
      {shouldShowEvalDetails ? (
        <div className={`rounded-lg border p-3 ${
          item.evalVerdict === 'fail'
            ? 'border-red-200 bg-red-50'
            : 'border-amber-200 bg-amber-50'
        }`}>
          <p className={`text-xs font-bold ${
            item.evalVerdict === 'fail' ? 'text-red-700' : 'text-amber-800'
          }`}>
            Grounding check
          </p>
          <ul className={`mt-1 list-disc space-y-1 pl-4 text-xs leading-5 ${
            item.evalVerdict === 'fail' ? 'text-red-800' : 'text-amber-900'
          }`}>
            {(item.evalWarnings ?? []).map((warning, index) => (
              <li key={index}>
                <span className="font-semibold capitalize">
                  {warning.type.replaceAll('_', ' ')}
                </span>
                {': '}
                {warning.message}
              </li>
            ))}
            {item.evalVerdict === 'fail' ? (
              <li>This item requires explicit acknowledgement before applying.</li>
            ) : (
              <li>Review the generated content and source evidence before applying.</li>
            )}
            {item.incompleteReasoning ? <li>The agent marked this reasoning as incomplete.</li> : null}
          </ul>
        </div>
      ) : null}
      {item.incompleteReasoning && !shouldShowEvalDetails ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          The agent marked this reasoning as incomplete.
        </p>
      ) : null}
    </div>
  )
}

type DiffLine = {
  kind: 'same' | 'add' | 'remove'
  text: string
}

function bodyLines(markdown: string) {
  if (!markdown.trim()) return []
  return markdown.replace(/\r\n/g, '\n').split('\n')
}

function lineDiff(beforeMarkdown: string, afterMarkdown: string): DiffLine[] {
  const before = bodyLines(beforeMarkdown)
  const after = bodyLines(afterMarkdown)

  if (!before.length) {
    return after.map((text) => ({ kind: 'add', text }))
  }

  if (!after.length) {
    return before.map((text) => ({ kind: 'remove', text }))
  }

  const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0) as number[])

  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      table[row][column] =
        before[row] === after[column]
          ? table[row + 1][column + 1] + 1
          : Math.max(table[row + 1][column], table[row][column + 1])
    }
  }

  const diff: DiffLine[] = []
  let beforeIndex = 0
  let afterIndex = 0

  while (beforeIndex < before.length && afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      diff.push({ kind: 'same', text: before[beforeIndex] })
      beforeIndex += 1
      afterIndex += 1
    } else if (table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) {
      diff.push({ kind: 'remove', text: before[beforeIndex] })
      beforeIndex += 1
    } else {
      diff.push({ kind: 'add', text: after[afterIndex] })
      afterIndex += 1
    }
  }

  while (beforeIndex < before.length) {
    diff.push({ kind: 'remove', text: before[beforeIndex] })
    beforeIndex += 1
  }

  while (afterIndex < after.length) {
    diff.push({ kind: 'add', text: after[afterIndex] })
    afterIndex += 1
  }

  return diff
}

function existingCompiledNoteFor(item: ProposalItem, compiledNotes: CompiledNote[]) {
  const title = payloadText(item.payload, 'title')
  const domain = payloadText(item.payload, 'domain')
  const noteType = payloadText(item.payload, 'noteType', payloadText(item.payload, 'knowledgeType'))

  if (!title) return null

  return (
    compiledNotes.find((note) => {
      const sameTitle = note.title.toLowerCase() === title.toLowerCase()
      const sameDomain = !domain || note.domain.toLowerCase() === domain.toLowerCase()
      const sameType = !noteType || note.noteType.toLowerCase() === noteType.toLowerCase()
      return sameTitle && sameDomain && sameType
    }) ?? null
  )
}

function KnowledgeDiff({
  afterMarkdown,
  beforeMarkdown,
}: {
  afterMarkdown: string
  beforeMarkdown: string
}) {
  const lines = lineDiff(beforeMarkdown, afterMarkdown)

  if (!lines.length) {
    return (
      <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
        This knowledge note will be created or updated after approval.
      </p>
    )
  }

  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-surface font-mono text-xs leading-5">
      {lines.map((line, index) => {
        const prefix = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '
        const className =
          line.kind === 'add'
            ? 'bg-emerald-50 text-emerald-800'
            : line.kind === 'remove'
              ? 'bg-red-50 text-red-800'
              : 'bg-surface text-gray-600'

        return (
          <div className={`grid grid-cols-[28px_1fr] gap-2 px-3 py-0.5 ${className}`} key={`${line.kind}-${index}`}>
            <span className="select-none text-right font-bold opacity-75">{prefix}</span>
            <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
          </div>
        )
      })}
    </div>
  )
}

function KnowledgeUpdateCard({
  compiledNotes,
  item,
}: {
  compiledNotes: CompiledNote[]
  item: ProposalItem
}) {
  const body = payloadText(item.payload, 'bodyMarkdown')
  const explicitBefore =
    payloadText(item.payload, 'previousBodyMarkdown') ||
    payloadText(item.payload, 'beforeBodyMarkdown') ||
    payloadText(item.payload, 'oldBodyMarkdown') ||
    payloadText(item.payload, 'currentBodyMarkdown')
  const before = explicitBefore || existingCompiledNoteFor(item, compiledNotes)?.bodyMarkdown || ''
  const knowledgeType = payloadText(item.payload, 'knowledgeType', 'knowledge')
  const domain = payloadText(item.payload, 'domain')
  const suggestions = inferredSuggestions(item)

  return (
    <article className="rounded-lg border border-gray-200 bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="line-clamp-2 min-w-0 text-base font-extrabold text-ink">
          {payloadLabel(item.payload)}
        </h4>
        <Pill className="shrink-0 capitalize" tone={statusTone(item.status)}>
          {item.status}
        </Pill>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <MetadataPill>{knowledgeType}</MetadataPill>
        {domain ? <MetadataPill>{domain}</MetadataPill> : null}
      </div>
      <ProposalItemBadges item={item} />
      <ProposalItemWarnings item={item} />
      {item.rationale ? (
        <p className="mb-3 mt-3 text-sm leading-6 text-gray-600">{item.rationale}</p>
      ) : null}
      {body ? (
        <KnowledgeDiff afterMarkdown={body} beforeMarkdown={before} />
      ) : (
        <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
          This knowledge note will be created or updated after approval.
        </p>
      )}
      {suggestions.length ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">Inferred suggestions not applied</p>
          <div className="mt-2 space-y-2">
            {suggestions.map((suggestion, index) => (
              <div className="rounded-md bg-surface/70 p-2 text-xs leading-5 text-amber-950" key={`${suggestion.text}-${index}`}>
                <p className="font-bold">{suggestion.text}</p>
                {suggestion.reason ? <p className="mt-1 text-amber-900">{suggestion.reason}</p> : null}
                <p className="mt-1 text-xs font-semibold capitalize text-amber-800">
                  Confidence: {suggestion.confidence}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function EmptyState({ activeTab, isLoading }: { activeTab: ReviewTab; isLoading: boolean }) {
  const copy =
    activeTab === 'done'
      ? { title: 'Nothing reviewed yet', body: 'Approved and rejected proposals show up here.' }
      : {
          title: 'Nothing to review',
          body: 'Capture a source and index it. The agent drafts proposals for you to approve here.',
        }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
      <Sparkles aria-hidden className="mx-auto mb-3 text-accent" size={28} />
      <h2 className="text-base font-extrabold text-ink">{isLoading ? 'Loading proposals…' : copy.title}</h2>
      {isLoading ? null : (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-600">{copy.body}</p>
      )}
    </div>
  )
}

function ReviewDetailModal({
  compiledNotes,
  isSubmitting,
  onApproveProposal,
  onClose,
  onRejectProposal,
  onToggleAdvancedDetails,
  proposal,
  rawSources,
  showAdvancedDetails,
}: {
  compiledNotes: CompiledNote[]
  isSubmitting: boolean
  onApproveProposal: (proposalId: string, indexingOutcomeOverride?: IndexingOutcomeOverride) => void
  onClose: () => void
  onRejectProposal: (proposalId: string) => void
  onToggleAdvancedDetails: () => void
  proposal: Proposal
  rawSources: RawSource[]
  showAdvancedDetails: boolean
}) {
  const sourceRawSource = proposalRawSource(proposal, rawSources)
  const sourceChunks = sourceRawSource?.chunks ?? []
  const selectedKnowledgeItems = knowledgeItems(proposal)
  const gatedItems = proposal.items.filter(itemRequiresAcknowledgement)
  const recommendation = indexingRecommendation(proposal)
  const [acknowledgedItemIds, setAcknowledgedItemIds] = useState<string[]>([])
  const allRequiredItemsAcknowledged = gatedItems.every((item) => acknowledgedItemIds.includes(item.id))
  const canApply =
    !isSubmitting &&
    proposal.status === 'pending' &&
    (gatedItems.length === 0 || allRequiredItemsAcknowledged)

  useEffect(() => {
    setAcknowledgedItemIds([])
  }, [proposal.id])

  function toggleAcknowledgement(itemId: string) {
    setAcknowledgedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    )
  }

  useDialog(onClose)

  const pendingAcknowledgements = gatedItems.length - acknowledgedItemIds.filter((id) =>
    gatedItems.some((item) => item.id === id),
  ).length

  return (
    <div
      aria-labelledby="review-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-2xl">
        <header className="border-b border-gray-200 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-extrabold text-ink" id="review-detail-title">
                {sourceTitle(sourceRawSource)}
              </h2>
              <p className="mt-2 max-w-[760px] text-sm leading-6 text-gray-600">
                Confirm the source evidence, inspect the proposed knowledge diff, then apply it.
              </p>
              {proposal.status === 'pending' && pendingAcknowledgements > 0 ? (
                <p className="mt-2 text-sm font-semibold text-amber-800" id="review-apply-hint">
                  Acknowledge {pluralize(pendingAcknowledgements, 'flagged item')} below to enable apply.
                </p>
              ) : null}
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
              <button
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 text-[13px] font-bold text-ink disabled:opacity-50 sm:flex-none"
                disabled={isSubmitting || proposal.status !== 'pending'}
                onClick={() => onRejectProposal(proposal.id)}
                type="button"
              >
                <X aria-hidden size={15} />
                Reject
              </button>
              <button
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-violet px-4 text-[13px] font-extrabold text-white hover:bg-violet-dark disabled:opacity-50 sm:flex-none"
                disabled={!canApply}
                aria-describedby={pendingAcknowledgements > 0 ? 'review-apply-hint' : undefined}
                onClick={() => onApproveProposal(proposal.id)}
                type="button"
              >
                <Check aria-hidden size={15} />
                {recommendation.outcome === 'keep_searchable' ? 'Keep searchable' : 'Apply updates'}
              </button>
              {recommendation.outcome === 'keep_searchable' ? (
                <button
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 text-[13px] font-bold text-ink disabled:opacity-50 sm:flex-none"
                  disabled={!canApply}
                  onClick={() => onApproveProposal(proposal.id, 'create_knowledge')}
                  type="button"
                >
                  <FileText aria-hidden size={15} />
                  Create knowledge instead
                </button>
              ) : (
                <button
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 text-[13px] font-bold text-ink disabled:opacity-50 sm:flex-none"
                  disabled={!canApply}
                  onClick={() => onApproveProposal(proposal.id, 'keep_searchable')}
                  type="button"
                >
                  <BookOpen aria-hidden size={15} />
                  Keep source only
                </button>
              )}
              <button
                aria-label="Close update review"
                className="grid h-10 w-10 place-items-center rounded-lg border border-gray-300 bg-surface text-gray-600 hover:bg-gray-50 hover:text-ink"
                onClick={onClose}
                type="button"
              >
                <X aria-hidden size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-slate-50 lg:grid-cols-[minmax(520px,1fr)_340px]">
          <div className="min-h-0 overflow-y-auto px-6 py-6">
            <RecommendationCard recommendation={recommendation} />

            <section className="mb-4 rounded-lg border border-gray-200 bg-surface p-5">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h3 className="text-lg font-extrabold text-ink">
                  {summarizeProposal(proposal) || pluralize(proposal.items.length, 'update')}
                </h3>
                <Pill className="capitalize" tone={statusTone(proposal.status)}>
                  {proposal.status}
                </Pill>
              </div>
              <p className="text-sm leading-6 text-gray-600">
                {proposal.rationale ?? 'Agent found incremental knowledge changes from this source.'}
              </p>
            </section>

            <section className="mb-4">
              <h3 className="mb-3 text-lg font-extrabold text-ink">
                {pluralize(selectedKnowledgeItems.length, 'note')} to apply
              </h3>
              {selectedKnowledgeItems.length ? (
                <div className="space-y-3">
                  {selectedKnowledgeItems.map((item) => (
                    <KnowledgeUpdateCard compiledNotes={compiledNotes} item={item} key={item.id} />
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-gray-300 bg-slate-50 p-4 text-sm leading-6 text-gray-500">
                  This proposal does not contain a knowledge note update.
                </p>
              )}
              {gatedItems.length ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-extrabold text-amber-900">
                    Explicit acknowledgement required
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Items with unresolved conflicts or failed grounding checks are not safe to apply automatically.
                    Review each one before applying this proposal.
                  </p>
                  <div className="mt-3 space-y-2">
                    {gatedItems.map((item) => (
                      <label
                        className="flex items-start gap-2 rounded-md border border-amber-200 bg-surface/70 p-3 text-xs leading-5 text-amber-950"
                        key={item.id}
                      >
                        <input
                          checked={acknowledgedItemIds.includes(item.id)}
                          className="mt-1"
                          onChange={() => toggleAcknowledgement(item.id)}
                          type="checkbox"
                        />
                        <span>
                          {item.evalVerdict === 'fail'
                            ? 'I have reviewed the grounding warnings and accept this proposal'
                            : 'I have read the conflict summary and understand the implications'}
                          <span className="mt-1 block font-bold text-amber-900">
                            {payloadLabel(item.payload)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg border border-gray-200 bg-surface">
              <button
                aria-expanded={showAdvancedDetails}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                onClick={onToggleAdvancedDetails}
                type="button"
              >
                <div>
                  <p className="text-sm font-extrabold text-ink">Advanced details</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    Inspect each proposal item before applying this update.
                  </p>
                </div>
                <ChevronDown
                  aria-hidden
                  className={`shrink-0 text-gray-500 transition-transform ${showAdvancedDetails ? 'rotate-180' : ''}`}
                  size={18}
                />
              </button>

              {showAdvancedDetails ? (
                <div className="space-y-4 border-t border-gray-200 p-5">
                  {proposal.items.map((item) => (
                    <article className="border-t border-gray-200 pt-4 first:border-t-0 first:pt-0" key={item.id}>
                      <div className="mb-3 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-500">
                            {itemVerb(item.actionType)} · {actionLabel(item.actionType)}
                          </p>
                          <h4 className="mt-0.5 text-base font-extrabold text-ink">
                            {payloadLabel(item.payload)}
                          </h4>
                        </div>
                        <Pill className="capitalize" tone={statusTone(item.status)}>
                          {item.status}
                        </Pill>
                      </div>
                      {item.rationale ? (
                        <p className="mb-3 text-sm leading-6 text-gray-600">{item.rationale}</p>
                      ) : null}
                      <ProposalItemBadges item={item} />
                      <ProposalItemWarnings item={item} />
                      {payloadText(item.payload, 'bodyMarkdown') ? (
                        <div className="mt-3">
                          <KnowledgeDiff
                            afterMarkdown={payloadText(item.payload, 'bodyMarkdown')}
                            beforeMarkdown={existingCompiledNoteFor(item, compiledNotes)?.bodyMarkdown ?? ''}
                          />
                        </div>
                      ) : (
                        <p className="mt-3 rounded-lg border border-gray-200 bg-surface p-3 text-xs leading-5 text-gray-600">
                          {payloadText(item.payload, 'rationale', 'This update will be applied after approval.')}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-gray-200 bg-surface px-5 py-6 lg:border-l lg:border-t-0">
            <section className="mb-6">
              <h3 className="mb-3 text-sm font-extrabold text-ink">Source evidence</h3>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-accent">
                  {sourceRawSource?.sourceRole === 'reference' ? (
                    <BookOpen aria-hidden size={17} />
                  ) : (
                    <FileText aria-hidden size={17} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[13px] font-bold text-ink">
                    {sourceTitle(sourceRawSource)}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-gray-500">
                    {proposalLifecycle(proposal)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <MetadataPill>{sourceRoleLabel(sourceRawSource?.sourceRole)}</MetadataPill>
                <MetadataPill>{sourceTypeLabel(sourceRawSource?.sourceType)}</MetadataPill>
                <MetadataPill>{pluralize(sourceChunks.length, 'chunk')}</MetadataPill>
              </div>
              <p className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
                {sourceRawSource?.bodyMarkdown ?? 'The source text is no longer available.'}
              </p>
            </section>

            <section className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                <Layers3 aria-hidden size={15} className="text-gray-500" />
                <h3 className="text-sm font-extrabold text-ink">Evidence chunks</h3>
              </div>
              {sourceChunks.length ? (
                <ul className="space-y-2">
                  {sourceChunks.map((chunk) => (
                    <li className="rounded-lg border border-gray-200 bg-slate-50 p-3" key={chunk.id}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="line-clamp-1 text-xs font-bold text-ink">
                          {chunk.heading ?? `Chunk ${chunk.chunkIndex + 1}`}
                        </p>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-gray-500">
                          #{chunk.chunkIndex + 1} · ~{chunk.tokenEstimate}
                        </span>
                      </div>
                      <p className="line-clamp-4 text-xs leading-5 text-gray-600">
                        {chunk.bodyMarkdown}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed border-gray-300 bg-slate-50 p-4 text-xs leading-5 text-gray-600">
                  No source chunks are linked to this proposal yet.
                </p>
              )}
            </section>

            <p className="rounded-lg bg-slate-50 p-4 text-xs leading-5 text-gray-600">
              <span className="font-bold text-ink">Approving</span> applies the proposed knowledge updates.{' '}
              <span className="font-bold text-ink">Rejecting</span> leaves existing knowledge unchanged.
            </p>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function ReviewQueuePage({
  compiledNotes,
  proposals,
  rawSources,
  selectedProposalId,
  isSubmitting,
  notice,
  error,
  onSelectProposal,
  onApproveProposal,
  onRejectProposal,
  onRefresh,
}: {
  compiledNotes: CompiledNote[]
  proposals: Proposal[]
  rawSources: RawSource[]
  selectedProposalId: string | null
  isSubmitting: boolean
  notice: string | null
  error: string | null
  onSelectProposal: (proposalId: string) => void
  onApproveProposal: (proposalId: string, indexingOutcomeOverride?: IndexingOutcomeOverride) => void
  onRejectProposal: (proposalId: string) => void
  onRefresh: () => void
}) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('updates')
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null)
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false)
  const pendingProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'pending'),
    [proposals],
  )
  const reviewedProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status !== 'pending'),
    [proposals],
  )
  const activeList = activeTab === 'done' ? reviewedProposals : pendingProposals
  const modalProposal = detailProposalId
    ? proposals.find((proposal) => proposal.id === detailProposalId) ?? null
    : null

  function openProposal(proposalId: string) {
    onSelectProposal(proposalId)
    setDetailProposalId(proposalId)
    setShowAdvancedDetails(false)
  }

  return (
    <section className="flex min-h-0 flex-1 bg-canvas text-ink">
      <div className="flex min-w-0 flex-1 flex-col px-8 py-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Review queue</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">
              Proposals the agent drafted from your sources. Open one to inspect the diff and source
              evidence, then apply or reject it.
            </p>
          </div>
          <button
            aria-label="Refresh queue"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gray-300 bg-surface text-gray-600 hover:bg-gray-50 hover:text-ink"
            disabled={isSubmitting}
            onClick={onRefresh}
            title="Refresh queue"
            type="button"
          >
            <RotateCw aria-hidden className={isSubmitting ? 'animate-spin' : ''} size={17} />
          </button>
        </div>

        <div
          aria-label="Proposal status"
          className="mb-5 grid max-w-[560px] grid-cols-2 rounded-lg border border-gray-200 bg-slate-50 p-1"
          role="tablist"
        >
          {tabs.map((tab) => {
            const count = tab.key === 'updates' ? pendingProposals.length : reviewedProposals.length
            return (
              <button
                aria-selected={activeTab === tab.key}
                className={`rounded-md px-2 py-2 text-xs font-bold ${
                  activeTab === tab.key
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-gray-600 hover:text-ink'
                }`}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                type="button"
              >
                {tab.label}
                {count ? <span className="ml-1.5 tabular-nums text-accent">{count}</span> : null}
              </button>
            )
          })}
        </div>

        {error || notice ? (
          <div className="mb-4 space-y-2">
            {error ? <Banner tone="danger">{error}</Banner> : null}
            {notice ? <Banner tone="success">{notice}</Banner> : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1" role="tabpanel">
          {activeList.length ? (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
              <div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(160px,1fr)_150px_110px] gap-4 border-b border-gray-200 bg-slate-50 px-4 py-3 text-xs font-bold text-gray-600 max-lg:hidden">
                <span>Source</span>
                <span>Summary</span>
                <span>Type</span>
                <span>Status</span>
              </div>
              {activeList.map((proposal) => {
                const rawSource = proposalRawSource(proposal, rawSources)
                const hasConflict = proposal.items.some((item) => item.conflictDetected)
                const hasFailedEval = proposal.items.some((item) => item.evalVerdict === 'fail')
                const hasWarnEval = proposal.items.some((item) => item.evalVerdict === 'warn')
                return (
                  <button
                    className={`grid w-full gap-3 border-b border-gray-200 px-4 py-3 text-left transition-colors last:border-b-0 lg:grid-cols-[minmax(220px,1.4fr)_minmax(160px,1fr)_150px_110px] lg:items-center ${
                      proposal.id === selectedProposalId
                        ? 'bg-violet/10'
                        : 'bg-surface hover:bg-slate-50'
                    }`}
                    key={proposal.id}
                    onClick={() => openProposal(proposal.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-bold text-ink">
                        {sourceTitle(rawSource)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-gray-500">
                        {new Date(proposal.createdAt).toLocaleDateString([], {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-xs font-bold text-gray-700">
                        {summarizeProposal(proposal) || pluralize(proposal.items.length, 'update')}
                      </p>
                      <p className="mt-1 line-clamp-1 text-xs leading-5 text-gray-600">
                        {proposal.rationale ?? 'Agent found incremental knowledge updates.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill>{sourceRoleLabel(rawSource?.sourceRole)}</Pill>
                      <Pill>{pluralize(rawSource?.chunks.length ?? 0, 'chunk')}</Pill>
                      {hasConflict ? <Pill tone="warning">Conflict</Pill> : null}
                      {hasFailedEval ? (
                        <Pill tone="danger">Check failed</Pill>
                      ) : hasWarnEval ? (
                        <Pill tone="warning">Check warning</Pill>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2 lg:justify-start">
                      <Pill className="capitalize" tone={statusTone(proposal.status)}>
                        {proposal.status}
                      </Pill>
                      <span className="text-xs font-bold text-gray-600 lg:hidden">Open</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState activeTab={activeTab} isLoading={isSubmitting && proposals.length === 0} />
          )}
        </div>
      </div>

      {modalProposal ? (
        <ReviewDetailModal
          compiledNotes={compiledNotes}
          isSubmitting={isSubmitting}
          onApproveProposal={onApproveProposal}
          onClose={() => setDetailProposalId(null)}
          onRejectProposal={onRejectProposal}
          onToggleAdvancedDetails={() => setShowAdvancedDetails((current) => !current)}
          proposal={modalProposal}
          rawSources={rawSources}
          showAdvancedDetails={showAdvancedDetails}
        />
      ) : null}
    </section>
  )
}
