import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  RotateCw,
} from 'lucide-react'
import { useState } from 'react'
import { Banner, Pill, pluralize, type Tone } from '../../components/ui'
import { isRecord, payloadLabel } from '../../lib/knowledge'
import type { AgentRun, Proposal, RawSource } from '../../types/domain'
import { agentRunOutputText, agentRunTitle, shortTimestamp } from './agentRunView'

type ActivityGroup = 'running' | 'needsReview' | 'failed' | 'completed'

export type AgentActivitySummary = {
  running: number
  needsReview: number
  failed: number
}

function proposalIdForRun(agentRun: AgentRun) {
  if (!isRecord(agentRun.output)) return null
  return typeof agentRun.output.proposalId === 'string' ? agentRun.output.proposalId : null
}

function sourceTitleForRun(agentRun: AgentRun, rawSources: RawSource[]) {
  const rawSourceId =
    isRecord(agentRun.input) && typeof agentRun.input.rawSourceId === 'string'
      ? agentRun.input.rawSourceId
      : null
  const rawSource = rawSourceId ? rawSources.find((source) => source.id === rawSourceId) : null
  return rawSource ? (rawSource.title ?? 'Untitled source') : null
}

function runStep(agentRun: AgentRun, proposal: Proposal | null) {
  if (agentRun.status === 'queued') return 'Waiting to start'
  if (agentRun.status === 'running') return 'Working in the background'
  if (agentRun.status === 'failed') return agentRun.error ?? 'Run failed'
  if (proposal?.status === 'pending') return 'Proposal ready for review'
  return agentRunOutputText(agentRun)
}

export function summarizeAgentActivity(agentRuns: AgentRun[], proposals: Proposal[]): AgentActivitySummary {
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]))
  return agentRuns.reduce(
    (summary, agentRun) => {
      const proposalId = proposalIdForRun(agentRun)
      const proposal = proposalId ? proposalById.get(proposalId) ?? null : null
      if (agentRun.status === 'queued' || agentRun.status === 'running') {
        summary.running += 1
      } else if (agentRun.status === 'failed') {
        summary.failed += 1
      } else if (proposal?.status === 'pending') {
        summary.needsReview += 1
      }
      return summary
    },
    { running: 0, needsReview: 0, failed: 0 },
  )
}

function groupRuns(agentRuns: AgentRun[], proposals: Proposal[]) {
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]))
  const groups: Record<ActivityGroup, Array<{ agentRun: AgentRun; proposal: Proposal | null }>> = {
    running: [],
    needsReview: [],
    failed: [],
    completed: [],
  }

  for (const agentRun of agentRuns) {
    const proposalId = proposalIdForRun(agentRun)
    const proposal = proposalId ? proposalById.get(proposalId) ?? null : null
    if (agentRun.status === 'queued' || agentRun.status === 'running') {
      groups.running.push({ agentRun, proposal })
    } else if (agentRun.status === 'failed') {
      groups.failed.push({ agentRun, proposal })
    } else if (proposal?.status === 'pending') {
      groups.needsReview.push({ agentRun, proposal })
    } else {
      groups.completed.push({ agentRun, proposal })
    }
  }

  return groups
}

function groupCopy(group: ActivityGroup) {
  return {
    running: {
      icon: Clock3,
      label: 'Running',
      empty: 'No active runs.',
      tone: 'accent' as Tone,
      dot: 'bg-violet animate-pulse',
    },
    needsReview: {
      icon: FileText,
      label: 'Needs review',
      empty: 'No generated proposals waiting for review.',
      tone: 'warning' as Tone,
      dot: 'bg-amber-700',
    },
    failed: {
      icon: AlertTriangle,
      label: 'Failed',
      empty: 'No failed runs.',
      tone: 'danger' as Tone,
      dot: 'bg-red-600',
    },
    completed: {
      icon: CheckCircle2,
      label: 'Completed',
      empty: 'No completed runs yet.',
      tone: 'success' as Tone,
      dot: 'bg-emerald-700',
    },
  }[group]
}

const groupIconClass: Record<Tone, string> = {
  neutral: 'border-gray-200 bg-slate-100 text-gray-600',
  accent: 'border-violet/30 bg-violet/10 text-accent',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
}

function runStatusTone(status: string): Tone {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'accent'
  return 'neutral'
}

const rowButton =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold'

function ActivityRow({
  agentRun,
  dotClass,
  onOpenProposal,
  onRetry,
  onSelectAgentRun,
  proposal,
  rawSources,
}: {
  agentRun: AgentRun
  dotClass: string
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  proposal: Proposal | null
  rawSources: RawSource[]
}) {
  const sourceTitle = sourceTitleForRun(agentRun, rawSources)

  return (
    <article className="grid gap-3 border-t border-gray-200 px-4 py-3 first:border-t-0 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-ink">
            {sourceTitle ?? agentRunTitle(agentRun.runType)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{agentRunTitle(agentRun.runType)}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{runStep(agentRun, proposal)}</p>
          {proposal ? (
            <p className="mt-1 line-clamp-1 text-xs font-semibold text-gray-500">
              {payloadLabel(proposal.items[0]?.payload ?? {})}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Pill className="capitalize" tone={runStatusTone(agentRun.status)}>
          {agentRun.status}
        </Pill>
        <span className="text-xs font-medium text-gray-500">
          {shortTimestamp(agentRun.startedAt ?? agentRun.createdAt)}
        </span>
        {proposal?.status === 'pending' ? (
          <button
            className={`${rowButton} bg-violet text-white hover:bg-violet-dark`}
            onClick={() => onOpenProposal(proposal.id)}
            type="button"
          >
            <ExternalLink aria-hidden size={13} />
            Open review
          </button>
        ) : null}
        {agentRun.status === 'failed' ? (
          <button
            className={`${rowButton} border border-gray-300 bg-surface text-ink hover:bg-slate-50`}
            onClick={() => onRetry(agentRun.id)}
            type="button"
          >
            <RotateCw aria-hidden size={13} />
            Retry
          </button>
        ) : null}
        <button
          className={`${rowButton} border border-gray-300 bg-surface text-gray-600 hover:bg-slate-50 hover:text-ink`}
          onClick={() => onSelectAgentRun(agentRun.id)}
          type="button"
        >
          Details
        </button>
      </div>
    </article>
  )
}

function ActivityGroupSection({
  group,
  items,
  onOpenProposal,
  onRetry,
  onSelectAgentRun,
  isOpen,
  onToggle,
  rawSources,
}: {
  group: ActivityGroup
  items: Array<{ agentRun: AgentRun; proposal: Proposal | null }>
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  isOpen: boolean
  onToggle: () => void
  rawSources: RawSource[]
}) {
  const copy = groupCopy(group)
  const Icon = copy.icon
  const panelId = `activity-group-${group}`

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      <h2>
        <button
          aria-controls={panelId}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50"
          onClick={onToggle}
          type="button"
        >
          <span className="inline-flex min-w-0 items-center gap-3">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${groupIconClass[copy.tone]}`}
            >
              <Icon aria-hidden size={15} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">{copy.label}</span>
              <span className="block text-xs leading-5 text-gray-500">
                {items.length ? pluralize(items.length, 'run') : copy.empty}
              </span>
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-3">
            <span className="min-w-[28px] rounded-full border border-gray-200 bg-slate-50 px-2 py-0.5 text-center text-xs font-bold tabular-nums text-gray-600">
              {items.length}
            </span>
            <ChevronDown
              aria-hidden
              className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              size={17}
            />
          </span>
        </button>
      </h2>
      {isOpen && items.length ? (
        <div className="border-t border-gray-200" id={panelId}>
          {items.map(({ agentRun, proposal }) => (
            <ActivityRow
              agentRun={agentRun}
              dotClass={copy.dot}
              key={agentRun.id}
              onOpenProposal={onOpenProposal}
              onRetry={onRetry}
              onSelectAgentRun={onSelectAgentRun}
              proposal={proposal}
              rawSources={rawSources}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function AgentActivityPage({
  agentRuns,
  error,
  isLoading,
  notice,
  onOpenProposal,
  onRetry,
  onSelectAgentRun,
  proposals,
  rawSources,
}: {
  agentRuns: AgentRun[]
  error: string | null
  isLoading: boolean
  notice: string | null
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  proposals: Proposal[]
  rawSources: RawSource[]
}) {
  const groups = groupRuns(agentRuns, proposals)
  const summary = summarizeAgentActivity(agentRuns, proposals)
  const [openGroups, setOpenGroups] = useState<Record<ActivityGroup, boolean>>({
    running: true,
    needsReview: true,
    failed: true,
    completed: false,
  })
  const groupOrder: ActivityGroup[] = ['running', 'needsReview', 'failed', 'completed']

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas px-8 py-7">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Agent activity</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">
              Every compile run the agent has made, what it needs from you, and anything that failed.
            </p>
          </div>
          <dl className="flex shrink-0 gap-2">
            {[
              ['Running', summary.running],
              ['Needs review', summary.needsReview],
              ['Failed', summary.failed],
            ].map(([label, value]) => (
              <div className="min-w-[104px] rounded-lg border border-gray-200 bg-surface px-3 py-2" key={label}>
                <dt className="text-xs font-medium text-gray-500">{label}</dt>
                <dd className="mt-0.5 text-xl font-extrabold tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {error ? <Banner tone="danger">{error}</Banner> : null}
        {notice ? <Banner tone="success">{notice}</Banner> : null}

        {agentRuns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
            <p className="text-base font-bold text-ink">
              {isLoading ? 'Loading agent runs…' : 'No agent runs yet'}
            </p>
            {isLoading ? null : (
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-600">
                Capture a source and index it. The agent&apos;s runs show up here as they happen.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groupOrder.map((group) => (
              <ActivityGroupSection
                group={group}
                isOpen={openGroups[group]}
                items={groups[group]}
                key={group}
                onOpenProposal={onOpenProposal}
                onRetry={onRetry}
                onSelectAgentRun={onSelectAgentRun}
                onToggle={() => setOpenGroups((current) => ({ ...current, [group]: !current[group] }))}
                rawSources={rawSources}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
