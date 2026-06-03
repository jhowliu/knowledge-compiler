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
import { isRecord, payloadLabel } from '../../lib/knowledge'
import type { AgentRun, Proposal, RawNote, RawSource } from '../../types/domain'
import { agentRunLabel, agentRunOutputText, shortTimestamp } from './agentRunView'

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

function sourceIdForRun(agentRun: AgentRun) {
  if (!isRecord(agentRun.input)) return null
  const rawSourceId = typeof agentRun.input.rawSourceId === 'string' ? agentRun.input.rawSourceId : null
  const rawNoteId = typeof agentRun.input.rawNoteId === 'string' ? agentRun.input.rawNoteId : null
  return { rawNoteId, rawSourceId }
}

function sourceTitleForRun(agentRun: AgentRun, rawNotes: RawNote[], rawSources: RawSource[]) {
  const ids = sourceIdForRun(agentRun)
  const rawSource = ids?.rawSourceId
    ? rawSources.find((source) => source.id === ids.rawSourceId) ?? null
    : null
  const rawNote = ids?.rawNoteId
    ? rawNotes.find((note) => note.id === ids.rawNoteId) ?? null
    : null
  return rawSource?.title ?? rawNote?.title ?? agentRunLabel(agentRun.runType)
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
      className: 'border-violet/30 bg-violet/10 text-violet',
    },
    needsReview: {
      icon: FileText,
      label: 'Needs review',
      empty: 'No generated proposals waiting for review.',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    failed: {
      icon: AlertTriangle,
      label: 'Failed',
      empty: 'No failed runs.',
      className: 'border-red-200 bg-red-50 text-red-700',
    },
    completed: {
      icon: CheckCircle2,
      label: 'Completed',
      empty: 'No completed runs yet.',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
  }[group]
}

function ActivityRow({
  agentRun,
  onOpenProposal,
  onRetry,
  onSelectAgentRun,
  proposal,
  rawNotes,
  rawSources,
}: {
  agentRun: AgentRun
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  proposal: Proposal | null
  rawNotes: RawNote[]
  rawSources: RawSource[]
}) {
  return (
    <article className="grid gap-3 border-t border-gray-200 px-4 py-3 first:border-t-0 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-violet" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold text-ink">
            {agentRunLabel(agentRun.runType)} · {sourceTitleForRun(agentRun, rawNotes, rawSources)}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{runStep(agentRun, proposal)}</p>
            {proposal ? (
              <p className="mt-1 line-clamp-1 text-[11px] font-bold text-gray-400">
                {payloadLabel(proposal.items[0]?.payload ?? {})}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <span className="shrink-0 rounded-full border border-gray-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600">
          {agentRun.status}
        </span>
        <span className="text-[11px] font-semibold text-gray-400">
          {shortTimestamp(agentRun.startedAt ?? agentRun.createdAt)}
        </span>
        {proposal?.status === 'pending' ? (
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-violet px-2.5 text-xs font-bold text-white"
            onClick={() => onOpenProposal(proposal.id)}
            type="button"
          >
            <ExternalLink size={13} />
            Open review
          </button>
        ) : null}
        {agentRun.status === 'failed' ? (
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-bold text-ink hover:bg-slate-50"
            onClick={() => onRetry(agentRun.id)}
            type="button"
          >
            <RotateCw size={13} />
            Retry
          </button>
        ) : null}
        <button
          className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-2.5 text-xs font-bold text-gray-600 hover:bg-slate-50 hover:text-ink"
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
  rawNotes,
  rawSources,
}: {
  group: ActivityGroup
  items: Array<{ agentRun: AgentRun; proposal: Proposal | null }>
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  isOpen: boolean
  onToggle: () => void
  rawNotes: RawNote[]
  rawSources: RawSource[]
}) {
  const copy = groupCopy(group)
  const Icon = copy.icon

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50"
        onClick={onToggle}
        type="button"
      >
        <span className="inline-flex min-w-0 items-center gap-3">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${copy.className}`}>
            <Icon size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-ink">{copy.label}</span>
            <span className="block text-xs leading-5 text-gray-500">
              {items.length ? `${items.length} runs` : copy.empty}
            </span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-3">
          <span className="rounded-full border border-gray-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-gray-500">
            {items.length}
          </span>
          <ChevronDown
            className={`text-gray-400 transition ${isOpen ? 'rotate-180' : ''}`}
            size={17}
          />
        </span>
      </button>
      {isOpen ? (
        items.length ? (
          <div className="border-t border-gray-200">
            {items.map(({ agentRun, proposal }) => (
              <ActivityRow
                agentRun={agentRun}
                key={agentRun.id}
                onOpenProposal={onOpenProposal}
                onRetry={onRetry}
                onSelectAgentRun={onSelectAgentRun}
                proposal={proposal}
                rawNotes={rawNotes}
                rawSources={rawSources}
              />
            ))}
          </div>
        ) : (
          <p className="border-t border-gray-200 bg-slate-50 px-4 py-4 text-xs leading-5 text-gray-500">
            {copy.empty}
          </p>
        )
      ) : null}
    </section>
  )
}

export function AgentActivityPage({
  agentRuns,
  onOpenProposal,
  onRetry,
  onSelectAgentRun,
  proposals,
  rawNotes,
  rawSources,
}: {
  agentRuns: AgentRun[]
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  proposals: Proposal[]
  rawNotes: RawNote[]
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
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <header className="border-b border-gray-200 bg-white px-8 py-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet">Agent</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Activity</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Workspace-level indexing, review, retry, and run timeline state.
            </p>
          </div>
          <div className="grid w-[420px] grid-cols-3 gap-2">
            {[
              ['Running', summary.running],
              ['Needs review', summary.needsReview],
              ['Failed', summary.failed],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-gray-200 bg-slate-50 p-3" key={label}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
                <p className="mt-1 text-xl font-extrabold text-ink">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          {groupOrder.map((group) => (
            <ActivityGroupSection
              group={group}
              items={groups[group]}
              isOpen={openGroups[group]}
              key={group}
              onToggle={() => setOpenGroups((current) => ({ ...current, [group]: !current[group] }))}
              onOpenProposal={onOpenProposal}
              onRetry={onRetry}
              onSelectAgentRun={onSelectAgentRun}
              rawNotes={rawNotes}
              rawSources={rawSources}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
