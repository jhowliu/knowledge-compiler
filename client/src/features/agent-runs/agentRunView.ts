import { relationOptions } from '../../lib/constants'
import { isRecord } from '../../lib/knowledge'
import type { AgentRun } from '../../types/domain'

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

export function eventLabel(eventType: string) {
  return eventType.replaceAll('_', ' ')
}

export function agentRunOutputText(agentRun: AgentRun | null) {
  if (!agentRun) return 'No agent run selected.'
  if (agentRun.error) return agentRun.error
  if (isRecord(agentRun.output)) {
    const proposalId = typeof agentRun.output.proposalId === 'string' ? agentRun.output.proposalId : null
    const suggestionsCreated =
      typeof agentRun.output.suggestionsCreated === 'number' ? agentRun.output.suggestionsCreated : null
    const relatedNoteCount =
      typeof agentRun.output.relatedNoteCount === 'number' ? agentRun.output.relatedNoteCount : null
    if (proposalId) return `Created proposal ${proposalId}.`
    if (suggestionsCreated !== null) return `Created ${suggestionsCreated} pending link suggestions.`
    if (relatedNoteCount !== null) return `Found ${relatedNoteCount} related notes.`
  }
  return compactJson(agentRun.output)
}
