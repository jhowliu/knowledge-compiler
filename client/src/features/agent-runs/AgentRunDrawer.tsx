import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  RotateCw,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDialog } from '../../components/ui'
import { isRecord } from '../../lib/knowledge'
import type { AgentRun, AgentRunDetail, AgentRunEvent, WorkspaceData } from '../../types/domain'
import {
  agentRunOutputText,
  agentRunTitle,
  compactJson,
  eventCategoryClass,
  eventLabel,
  shortTimestamp,
} from './agentRunView'

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function shortId(value: string | null | undefined) {
  if (!value) return null
  return value.length > 8 ? `${value.slice(0, 8)}...` : value
}

function durationLabel(agentRun: AgentRun | null, now = Date.now()) {
  if (!agentRun?.startedAt) return 'Not started'
  const end = agentRun.completedAt ? new Date(agentRun.completedAt) : new Date(now)
  const start = new Date(agentRun.startedAt)
  const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function statusTone(status: string | null | undefined) {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'running') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (status === 'queued') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-gray-200 bg-slate-50 text-gray-600'
}

function eventKey(event: AgentRunEvent) {
  return `${event.category}.${event.name}`
}

function hasEvent(events: AgentRunEvent[], keys: string[]) {
  return events.some((event) => keys.includes(eventKey(event)))
}

function payloadRecord(event: AgentRunEvent) {
  return isRecord(event.payload) ? event.payload : {}
}

function eventSummary(event: AgentRunEvent) {
  const payload = payloadRecord(event)
  const key = eventKey(event)

  if (key === 'lifecycle.queued') return 'Run was added to the background queue.'
  if (key === 'lifecycle.started') return 'Worker started processing this run.'
  if (key === 'lifecycle.completed') return agentRunOutputText({ output: payload, error: null } as AgentRun)
  if (key === 'lifecycle.failed') {
    const error = typeof payload.error === 'string' ? payload.error : 'The run stopped with an error.'
    return error
  }
  if (key === 'source.raw_note_loaded') {
    const role = typeof payload.sourceRole === 'string' ? payload.sourceRole.replaceAll('_', ' ') : 'source'
    const sourceType = typeof payload.sourceType === 'string' ? payload.sourceType : 'manual'
    return `Loaded ${role} (${sourceType}).`
  }
  if (key === 'source.raw_source_loaded') {
    const chunkCount = numberValue(payload.chunkCount)
    return `Loaded source${chunkCount === null ? '' : ` with ${chunkCount} chunks`}.`
  }
  if (key === 'source.notes_loaded') {
    const count = numberValue(payload.count)
    return count === null ? 'Loaded existing notes.' : `Loaded ${count} existing notes.`
  }
  if (key === 'indexing.react_loop_started') return 'Started the agent tool loop for source-aware indexing.'
  if (key === 'indexing.outcome_classified') {
    const outcome = typeof payload.outcome === 'string' ? payload.outcome.replaceAll('_', ' ') : 'indexing outcome'
    const reason = typeof payload.reason === 'string' ? payload.reason : null
    return reason ? `Recommended ${outcome}: ${reason}` : `Recommended ${outcome}.`
  }
  if (key === 'indexing.detected') {
    const concepts = Array.isArray(payload.concepts) ? payload.concepts.length : null
    const provider = typeof payload.provider === 'string' ? payload.provider : 'LLM'
    return concepts === null ? `${provider} detected wiki facets.` : `${provider} detected ${concepts} concepts.`
  }
  if (key === 'indexing.drafted') {
    const conceptCount = numberValue(payload.conceptCount) ?? 0
    const claimCount = numberValue(payload.claimCount) ?? 0
    const methodCount = numberValue(payload.methodCount) ?? 0
    return `Drafted ${conceptCount} concepts, ${claimCount} claims, and ${methodCount} methods.`
  }
  if (key === 'indexing.related_found') {
    const relatedNotes = Array.isArray(payload.relatedNotes) ? payload.relatedNotes.length : 0
    return `Found ${relatedNotes} related knowledge candidates.`
  }
  if (key === 'tool.called') {
    const tool = typeof payload.tool === 'string' ? payload.tool.replaceAll('_', ' ') : 'tool'
    return `Called ${tool}.`
  }
  if (key === 'tool.result') {
    const tool = typeof payload.tool === 'string' ? payload.tool.replaceAll('_', ' ') : 'tool'
    return `Received ${tool} result.`
  }
  if (key === 'proposal.created') {
    const proposalId = typeof payload.proposalId === 'string' ? shortId(payload.proposalId) : null
    return proposalId ? `Created review proposal ${proposalId}.` : 'Created a review proposal.'
  }
  if (key === 'eval.completed') return 'Grounding and proposal checks completed.'

  return compactJson(event.payload)
}

function latestConceptNames(events: AgentRunEvent[]) {
  const detected = [...events].reverse().find((event) => eventKey(event) === 'indexing.detected')
  const concepts = detected && isRecord(detected.payload) && Array.isArray(detected.payload.concepts)
    ? detected.payload.concepts
    : []
  return concepts
    .map((concept) => isRecord(concept) && typeof concept.name === 'string' ? concept.name : null)
    .filter((name): name is string => Boolean(name))
    .slice(0, 8)
}

function latestRelatedNotes(events: AgentRunEvent[]) {
  const related = [...events].reverse().find((event) => eventKey(event) === 'indexing.related_found')
  const matches = related && isRecord(related.payload) && Array.isArray(related.payload.relatedNotes)
    ? related.payload.relatedNotes
    : []
  return matches
    .map((match) => isRecord(match) ? match : null)
    .filter((match): match is Record<string, unknown> => Boolean(match))
    .slice(0, 5)
}

function currentStep(agentRun: AgentRun | null, events: AgentRunEvent[], hasProposal: boolean) {
  if (!agentRun) return 'Loading run details'
  if (agentRun.status === 'failed') return 'Run failed'
  if (agentRun.status === 'completed' && hasProposal) return 'Waiting for review'
  if (agentRun.status === 'completed') return 'Run completed'
  const lastEvent = events.at(-1)
  if (lastEvent) return eventLabel(lastEvent)
  if (agentRun.status === 'queued') return 'Waiting in queue'
  return 'Working in the background'
}

function progressSteps(agentRun: AgentRun | null, events: AgentRunEvent[], hasProposal: boolean) {
  const failed = agentRun?.status === 'failed'
  const completed = agentRun?.status === 'completed'
  const definitions = [
    {
      label: 'Queued',
      summary: 'Run was added to the agent queue.',
      keys: ['lifecycle.queued'],
    },
    {
      label: 'Loaded source',
      summary: 'The raw note/source is available to the agent.',
      keys: ['source.raw_note_loaded', 'source.raw_source_loaded', 'source.notes_loaded'],
    },
    {
      label: 'Extracted knowledge',
      summary: 'Concepts, claims, methods, and constraints were detected.',
      keys: ['indexing.detected', 'indexing.drafted', 'indexing.extraction_completed'],
    },
    {
      label: 'Searched related knowledge',
      summary: 'Existing knowledge notes were checked for overlap.',
      keys: ['indexing.related_found'],
    },
    {
      label: 'Classified outcome',
      summary: 'The agent decided after checking whether related knowledge already exists.',
      keys: ['indexing.outcome_classified'],
    },
    {
      label: 'Drafted proposal',
      summary: 'A reviewable knowledge update was created.',
      keys: ['proposal.created'],
    },
  ]

  const firstPending = definitions.findIndex((definition) => !hasEvent(events, definition.keys))
  return definitions.map((definition, index) => {
    const done = hasEvent(events, definition.keys)
    const current = !failed && !completed && firstPending === index
    return {
      ...definition,
      status: done || (completed && (index < definitions.length - 1 || hasProposal))
        ? 'done'
        : current
          ? 'current'
          : 'pending',
    }
  })
}

function StepIcon({ status }: { status: string }) {
  if (status === 'done') return <CheckCircle2 size={18} className="text-emerald-700" />
  if (status === 'current') return <Clock3 size={18} className="text-sky-700" />
  return <Circle size={18} className="text-gray-400" />
}

function RelatedOutput({ match }: { match: Record<string, unknown> }) {
  const title = typeof match.title === 'string'
    ? match.title
    : isRecord(match.note) && typeof match.note.title === 'string'
      ? match.note.title
      : 'Related knowledge'
  const reason = typeof match.reason === 'string'
    ? match.reason
    : typeof match.targetType === 'string'
      ? match.targetType.replaceAll('_', ' ')
      : 'Related candidate'

  return (
    <div className="rounded-md border border-gray-200 bg-surface p-2">
      <p className="line-clamp-1 text-xs font-extrabold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-4 text-gray-500">{reason}</p>
    </div>
  )
}

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
  const [now, setNow] = useState(() => Date.now())
  const output = isRecord(agentRun?.output) ? agentRun.output : {}
  const generatedProposalId =
    typeof output.proposalId === 'string' ? output.proposalId : null
  const generatedProposal = generatedProposalId
    ? data.proposals.find((proposal) => proposal.id === generatedProposalId) ?? null
    : null
  const extractionEval = detail?.extractionEval ?? null
  const evalWarnings = Array.isArray(extractionEval?.warnings)
    ? extractionEval.warnings.filter(isRecord)
    : []
  const judgeSummary = isRecord(extractionEval?.rawJudgeOutput) &&
    typeof extractionEval.rawJudgeOutput.summary === 'string'
    ? extractionEval.rawJudgeOutput.summary
    : null
  const events = detail?.events ?? []
  const concepts = latestConceptNames(events)
  const relatedNotes = latestRelatedNotes(events)
  const steps = progressSteps(agentRun, events, Boolean(generatedProposal))
  const runningStep = currentStep(agentRun, events, Boolean(generatedProposal))
  const outputStats = [
    ['Concepts', concepts.length],
    ['Related', relatedNotes.length],
  ]

  useEffect(() => {
    if (agentRun?.status !== 'running' || !agentRun.startedAt || agentRun.completedAt) {
      return undefined
    }
    setNow(Date.now())
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [agentRun?.completedAt, agentRun?.startedAt, agentRun?.status])

  useDialog(onClose)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button
        aria-hidden
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-labelledby="agent-run-title"
        aria-modal="true"
        className="relative z-10 flex h-full w-[560px] max-w-[min(560px,100vw)] flex-col border-l border-gray-200 bg-surface text-ink shadow-2xl"
        role="dialog"
      >
        <header className="border-b border-gray-200 px-6 py-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold text-ink" id="agent-run-title">
                {agentRun ? agentRunTitle(agentRun.runType) : 'Loading run'}
              </h2>
              <p className="mt-2 text-sm leading-5 text-gray-600">
                {runningStep}
              </p>
            </div>
            <button
              aria-label="Close agent run detail"
              autoFocus
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-ink"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Status', agentRun?.status ?? (isLoading ? 'loading' : 'missing')],
              ['Started', shortTimestamp(agentRun?.startedAt ?? null)],
              ['Duration', durationLabel(agentRun, now)],
            ].map(([label, value]) => (
              <div className="min-w-0 rounded-lg border border-gray-200 bg-slate-50 p-2.5" key={label}>
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <p className={`mt-1 truncate text-xs font-bold capitalize ${
                  label === 'Status'
                    ? `inline-flex rounded-full border px-2 py-0.5 ${statusTone(String(value))}`
                    : 'text-ink'
                }`}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <p className="rounded-lg border border-gray-200 bg-slate-50 p-4 text-sm text-gray-500">
              Loading agent run details...
            </p>
          ) : null}

          {!isLoading && !agentRun ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Agent run not found.
            </p>
          ) : null}

          {agentRun ? (
            <>
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-ink">Summary</h3>
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <p className="text-sm leading-6 text-gray-600">{agentRunOutputText(agentRun)}</p>
                  {agentRun.error ? (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                      <p className="flex items-center gap-2 text-xs font-bold text-red-800">
                        <AlertTriangle size={14} />
                        Run failed
                      </p>
                      <p className="mt-2 text-xs leading-5 text-red-800">{agentRun.error}</p>
                    </div>
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
                <h3 className="mb-3 text-sm font-extrabold text-ink">Progress</h3>
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <div className="space-y-4">
                    {steps.map((step, index) => (
                      <div className="grid grid-cols-[22px_1fr] gap-3" key={step.label}>
                        <div className="flex flex-col items-center">
                          <StepIcon status={step.status} />
                          {index < steps.length - 1 ? (
                            <div className={`mt-2 h-8 w-px ${
                              step.status === 'done' ? 'bg-emerald-800/70' : 'bg-slate-100'
                            }`} />
                          ) : null}
                        </div>
                        <div className="-mt-0.5">
                          <p className={`text-sm font-extrabold ${
                            step.status === 'pending' ? 'text-gray-500' : 'text-ink'
                          }`}>
                            {step.label}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">{step.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {agentRun.status === 'completed' && generatedProposal ? (
                    <div className="mt-4 rounded-md border border-violet/30 bg-violet/10 p-3 text-xs leading-5 text-accent">
                      <Check size={14} className="mr-1 inline" />
                      Proposal is ready for review.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-ink">Output</h3>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {outputStats.map(([label, value]) => (
                    <div className="rounded-lg border border-gray-200 bg-slate-50 p-3" key={label}>
                      <p className="text-xs font-medium text-gray-500">{label}</p>
                      <p className="mt-1 text-lg font-extrabold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
                {generatedProposal ? (
                  <article className="rounded-lg border border-violet/30 bg-violet/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="flex min-w-0 items-center gap-2 text-[13px] font-extrabold capitalize text-ink">
                        <FileText size={15} className="shrink-0 text-accent" />
                        {generatedProposal.detectedKnowledgeType ?? 'Knowledge update'}
                      </p>
                      <span className="rounded-full border border-violet/30 px-2 py-0.5 text-[11px] font-semibold capitalize text-accent">
                        {generatedProposal.status}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-gray-600">
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
                      Open in Review queue
                    </button>
                  </article>
                ) : (
                  <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-600">
                    {agentRun.status === 'queued' || agentRun.status === 'running'
                      ? 'No proposal yet. It appears here when the run finishes.'
                      : 'This run did not produce a proposal.'}
                  </p>
                )}
                {concepts.length ? (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-gray-500">Concepts detected</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {concepts.map((concept) => (
                        <span className="rounded-full border border-gray-300 bg-surface px-2 py-1 text-[11px] font-bold text-gray-600" key={concept}>
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {relatedNotes.length ? (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
                    <p className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
                      <Link2 size={14} className="text-accent" />
                      Related knowledge
                    </p>
                    <div className="space-y-2">
                      {relatedNotes.map((match, index) => (
                        <RelatedOutput match={match} key={`${String(match.id ?? match.title ?? index)}`} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-ink">Grounding check</h3>
                {extractionEval ? (
                  <article className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[13px] font-extrabold text-ink">Result</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        extractionEval.verdict === 'pass'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : extractionEval.verdict === 'warn'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-red-200 bg-red-50 text-red-700'
                      }`}>
                        {extractionEval.verdict}
                      </span>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-gray-200 bg-surface p-2">
                        <p className="text-xs font-medium text-gray-500">Coverage</p>
                        <p className="mt-1 text-xs font-extrabold text-ink">
                          {extractionEval.coverageScore === null
                            ? 'Unknown'
                            : `${Math.round(extractionEval.coverageScore * 100)}%`}
                        </p>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-surface p-2">
                        <p className="text-xs font-medium text-gray-500">Grounding</p>
                        <p className="mt-1 text-xs font-extrabold text-ink">
                          {extractionEval.groundingScore === null
                            ? 'Unknown'
                            : `${Math.round(extractionEval.groundingScore * 100)}%`}
                        </p>
                      </div>
                    </div>
                    {judgeSummary ? (
                      <p className="mb-3 rounded-md border border-gray-200 bg-surface p-2 text-xs leading-5 text-gray-600">
                        {judgeSummary}
                      </p>
                    ) : null}
                    {evalWarnings.length ? (
                      <ul className="space-y-2">
                        {evalWarnings.map((warning, index) => (
                          <li className="rounded-md border border-gray-200 bg-surface p-2 text-xs leading-5 text-gray-600" key={index}>
                            <span className="font-bold capitalize text-amber-800">
                              {typeof warning.type === 'string' ? warning.type.replaceAll('_', ' ') : 'warning'}
                            </span>
                            {typeof warning.affected_item_index === 'number' ? (
                              <span className="text-gray-500"> · item {warning.affected_item_index + 1}</span>
                            ) : null}
                            <span className="block">
                              {typeof warning.message === 'string'
                                ? warning.message
                                : compactJson(warning)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs leading-5 text-gray-500">No warnings recorded.</p>
                    )}
                  </article>
                ) : (
                  <p className="rounded-lg border border-gray-200 bg-slate-50 p-3 text-xs leading-5 text-gray-500">
                    No grounding check is attached to this run.
                  </p>
                )}
              </section>

              <section className="mt-6">
                <details className="group rounded-lg border border-gray-200 bg-slate-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-ink">Technical details</h3>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {events.length} raw events. Payloads are hidden by default.
                      </p>
                    </div>
                    <ChevronDown size={16} className="text-gray-500 transition group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-gray-200 p-3">
                    <div className="space-y-2">
                      {events.length ? (
                        events.map((event) => (
                          <details className="rounded-md border border-gray-200 bg-surface" key={event.id}>
                            <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3">
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-ink">{eventLabel(event)}</p>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-gray-500">
                                  {eventSummary(event)}
                                </p>
                              </div>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${eventCategoryClass(event.category)}`}>
                                {event.category}
                              </span>
                            </summary>
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t border-gray-200 bg-slate-100 p-3 text-[11px] leading-5 text-gray-500">
                              {compactJson(event.payload)}
                            </pre>
                          </details>
                        ))
                      ) : (
                        <p className="rounded-md border border-gray-200 bg-surface p-3 text-xs leading-5 text-gray-500">
                          No raw events recorded yet.
                        </p>
                      )}
                    </div>
                  </div>
                </details>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
