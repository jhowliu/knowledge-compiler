import { isRecord } from '../../lib/knowledge'
import type { AgentRun, AgentRunEvent } from '../../types/domain'

export function agentRunLabel(runType: string) {
  return runType.replaceAll('_', ' ')
}

export function compactJson(value: unknown) {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return 'Unable to render payload'
  }
}

export function shortTimestamp(value: string | null) {
  if (!value) return 'Not started'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function eventLabel(event: Pick<AgentRunEvent, 'category' | 'name'>) {
  const key = `${event.category}.${event.name}`
  const labels: Record<string, string> = {
    'lifecycle.queued': 'Queued',
    'lifecycle.retry_queued': 'Retry queued',
    'lifecycle.retry_of': 'Retry of failed run',
    'lifecycle.started': 'Started',
    'lifecycle.completed': 'Completed',
    'lifecycle.failed': 'Failed',
    'source.notes_loaded': 'Loaded notes',
    'source.raw_note_loaded': 'Loaded raw note',
    'source.raw_source_loaded': 'Loaded source',
    'tool.called': 'Tool called',
    'tool.result': 'Tool result',
    'indexing.classification_started': 'Classification started',
    'indexing.outcome_classified': 'Outcome classified',
    'indexing.extraction_completed': 'Extraction completed',
    'indexing.react_loop_started': 'Agent loop started',
    'indexing.detected': 'Index detected',
    'indexing.drafted': 'Wiki index drafted',
    'indexing.related_found': 'Related knowledge found',
    'indexing.loop_exited': 'Agent loop exited',
    'proposal.created': 'Proposal created',
    'eval.completed': 'Eval completed',
    'error.failed': 'Failed',
    'error.unknown': 'Unknown legacy event',
  }
  return labels[key] ?? key.replaceAll('.', ' ').replaceAll('_', ' ')
}

export function eventCategoryClass(category: AgentRunEvent['category']) {
  if (category === 'lifecycle') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (category === 'source') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (category === 'tool') return 'border-violet/30 bg-violet/10 text-accent'
  if (category === 'indexing') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (category === 'proposal') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (category === 'eval') return 'border-gray-200 bg-slate-100 text-gray-600'
  return 'border-red-200 bg-red-50 text-red-700'
}

/** "compile_raw_note" -> "Compile raw note". */
export function agentRunTitle(runType: string) {
  const label = agentRunLabel(runType)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function agentRunOutputText(agentRun: AgentRun | null) {
  if (!agentRun) return 'No agent run selected.'
  if (agentRun.error) return agentRun.error
  if (agentRun.status === 'queued') return 'Waiting in the queue.'
  if (agentRun.status === 'running') return 'Still working. This updates as the run progresses.'
  if (isRecord(agentRun.output)) {
    const proposalId = typeof agentRun.output.proposalId === 'string' ? agentRun.output.proposalId : null
    const indexingOutcome =
      typeof agentRun.output.indexingOutcome === 'string' ? agentRun.output.indexingOutcome : null
    const relatedNoteCount =
      typeof agentRun.output.relatedNoteCount === 'number' ? agentRun.output.relatedNoteCount : null
    if (proposalId && indexingOutcome === 'keep_searchable') return `Created source-only proposal ${proposalId}.`
    if (proposalId) return `Created proposal ${proposalId}.`
    if (relatedNoteCount !== null) return `Found ${relatedNoteCount} related notes.`
  }
  if (agentRun.output === null || agentRun.output === undefined) return 'No output was recorded.'
  return compactJson(agentRun.output)
}
