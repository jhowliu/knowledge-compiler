import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  RotateCw,
  X,
} from 'lucide-react'
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
    <article className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-ink">
            {agentRunLabel(agentRun.runType)} · {sourceTitleForRun(agentRun, rawNotes, rawSources)}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{runStep(agentRun, proposal)}</p>
          {proposal ? (
            <p className="mt-1 line-clamp-1 text-[11px] font-bold text-gray-400">
              {payloadLabel(proposal.items[0]?.payload ?? {})}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-gray-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600">
          {agentRun.status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
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
        <span className="ml-auto self-center text-[11px] font-semibold text-gray-400">
          {shortTimestamp(agentRun.startedAt ?? agentRun.createdAt)}
        </span>
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
  rawNotes,
  rawSources,
}: {
  group: ActivityGroup
  items: Array<{ agentRun: AgentRun; proposal: Proposal | null }>
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  rawNotes: RawNote[]
  rawSources: RawSource[]
}) {
  const copy = groupCopy(group)
  const Icon = copy.icon

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-extrabold text-ink">
          <span className={`grid h-7 w-7 place-items-center rounded-lg border ${copy.className}`}>
            <Icon size={14} />
          </span>
          {copy.label}
        </h3>
        <span className="text-xs font-bold text-gray-400">{items.length}</span>
      </div>
      {items.length ? (
        <div className="space-y-2">
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
        <p className="rounded-lg border border-dashed border-gray-300 bg-slate-50 p-3 text-xs leading-5 text-gray-500">
          {copy.empty}
        </p>
      )}
    </section>
  )
}

export function AgentActivityCenter({
  agentRuns,
  isOpen,
  onClose,
  onOpenProposal,
  onRetry,
  onSelectAgentRun,
  proposals,
  rawNotes,
  rawSources,
}: {
  agentRuns: AgentRun[]
  isOpen: boolean
  onClose: () => void
  onOpenProposal: (proposalId: string) => void
  onRetry: (agentRunId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  proposals: Proposal[]
  rawNotes: RawNote[]
  rawSources: RawSource[]
}) {
  if (!isOpen) return null

  const groups = groupRuns(agentRuns, proposals)
  const summary = summarizeAgentActivity(agentRuns, proposals)

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30">
      <button
        aria-label="Close agent activity"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside className="relative z-10 flex h-full w-[480px] flex-col border-l border-gray-200 bg-white shadow-2xl">
        <header className="border-b border-gray-200 px-5 py-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet">Agent</p>
              <h2 className="mt-1 text-xl font-extrabold text-ink">Activity center</h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                Workspace-level indexing, review, and retry state.
              </p>
            </div>
            <button
              aria-label="Close agent activity"
              className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-slate-50 hover:text-ink"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Running', summary.running],
              ['Needs review', summary.needsReview],
              ['Failed', summary.failed],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-gray-200 bg-slate-50 p-3" key={label}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
                <p className="mt-1 text-lg font-extrabold text-ink">{value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {(['running', 'needsReview', 'failed', 'completed'] as ActivityGroup[]).map((group) => (
            <ActivityGroupSection
              group={group}
              items={groups[group]}
              key={group}
              onOpenProposal={onOpenProposal}
              onRetry={onRetry}
              onSelectAgentRun={onSelectAgentRun}
              rawNotes={rawNotes}
              rawSources={rawSources}
            />
          ))}
        </div>
      </aside>
    </div>
  )
}
