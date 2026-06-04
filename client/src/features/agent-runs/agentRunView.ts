import { relationOptions } from '../../lib/constants'
import { isRecord } from '../../lib/knowledge'
import type { AgentRun, AgentRunEvent } from '../../types/domain'

export function relationLabel(relationType: string) {
  return relationType.replaceAll('_', ' ')
}

export function relationOptionLabel(relationType: string) {
  return relationOptions.find(([value]) => value === relationType)?.[1] ?? relationLabel(relationType)
}

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
    'linking.scored': 'Link candidates scored',
    'linking.candidates_found': 'Link candidates found',
    'linking.judged': 'Links judged',
    'linking.suggestion_created': 'Link suggestion created',
    'error.failed': 'Failed',
    'error.unknown': 'Unknown legacy event',
  }
  return labels[key] ?? key.replaceAll('.', ' ').replaceAll('_', ' ')
}

export function eventCategoryClass(category: AgentRunEvent['category']) {
  if (category === 'lifecycle') return 'border-sky-800/70 bg-sky-950/30 text-sky-200'
  if (category === 'source') return 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
  if (category === 'tool') return 'border-violet/50 bg-violet/15 text-violet'
  if (category === 'indexing') return 'border-cyan-800/70 bg-cyan-950/30 text-cyan-200'
  if (category === 'proposal') return 'border-amber-800/70 bg-amber-950/30 text-amber-200'
  if (category === 'eval') return 'border-fuchsia-800/70 bg-fuchsia-950/30 text-fuchsia-200'
  if (category === 'linking') return 'border-teal-800/70 bg-teal-950/30 text-teal-200'
  return 'border-red-800/70 bg-red-950/30 text-red-200'
}

export function agentRunOutputText(agentRun: AgentRun | null) {
  if (!agentRun) return 'No agent run selected.'
  if (agentRun.error) return agentRun.error
  if (isRecord(agentRun.output)) {
    const proposalId = typeof agentRun.output.proposalId === 'string' ? agentRun.output.proposalId : null
    const indexingOutcome =
      typeof agentRun.output.indexingOutcome === 'string' ? agentRun.output.indexingOutcome : null
    const suggestionsCreated =
      typeof agentRun.output.suggestionsCreated === 'number' ? agentRun.output.suggestionsCreated : null
    const relatedNoteCount =
      typeof agentRun.output.relatedNoteCount === 'number' ? agentRun.output.relatedNoteCount : null
    if (proposalId && indexingOutcome === 'keep_searchable') return `Created source-only proposal ${proposalId}.`
    if (proposalId) return `Created proposal ${proposalId}.`
    if (suggestionsCreated !== null) return `Created ${suggestionsCreated} pending link suggestions.`
    if (relatedNoteCount !== null) return `Found ${relatedNoteCount} related notes.`
  }
  return compactJson(agentRun.output)
}
