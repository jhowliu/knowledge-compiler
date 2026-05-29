import type { CompiledNote, DecisionRule } from '../types/domain'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function reviewMapSummary(note: CompiledNote | undefined) {
  const { decisionRules } = reviewMapDetails(note)
  const lines = decisionRules.map((rule) => `${rule.signal} -> ${rule.recommendation}`)

  if (lines.length) {
    return lines.slice(0, 4).join('. ')
  }

  return (
    note?.bodyMarkdown.slice(0, 180) ??
    'Weight = 1 -> BFS. Positive weights -> Dijkstra. All pairs -> Floyd-Warshall.'
  )
}

export function reviewMapDetails(note: CompiledNote | undefined) {
  const structuredData = isRecord(note?.structuredData) ? note.structuredData : {}
  const decisionRules: DecisionRule[] = (Array.isArray(structuredData.decisionRules)
    ? structuredData.decisionRules
    : [])
    .map((rule) => {
      if (!isRecord(rule)) return null
      const signal = typeof rule.signal === 'string' ? rule.signal : ''
      const recommendation = typeof rule.recommendation === 'string' ? rule.recommendation : ''
      const confidence = typeof rule.confidence === 'string' ? rule.confidence : 'medium'
      return signal && recommendation ? { signal, recommendation, confidence } : null
    })
    .filter((rule): rule is DecisionRule => Boolean(rule))

  const linkedAlgorithms = Array.isArray(structuredData.algorithms)
    ? structuredData.algorithms.filter((algorithm): algorithm is string => typeof algorithm === 'string')
    : []
  const commonTraps = Array.isArray(structuredData.commonTraps)
    ? structuredData.commonTraps.filter((trap): trap is string => typeof trap === 'string')
    : []
  const reviewActions = Array.isArray(structuredData.reviewActions)
    ? structuredData.reviewActions.filter((action): action is string => typeof action === 'string')
    : []
  const concepts = Array.isArray(structuredData.concepts)
    ? structuredData.concepts
        .map((concept) => {
          if (!isRecord(concept)) return null
          const name = typeof concept.name === 'string' ? concept.name : ''
          const conceptType = typeof concept.conceptType === 'string' ? concept.conceptType : 'topic'
          return name ? { name, conceptType } : null
        })
        .filter((concept): concept is { name: string; conceptType: string } => Boolean(concept))
    : []

  return {
    decisionRules,
    linkedAlgorithms,
    commonTraps,
    reviewActions,
    concepts,
  }
}

export function payloadText(payload: Record<string, unknown>, key: string, fallback = '') {
  const value = payload[key]
  return typeof value === 'string' ? value : fallback
}

export function payloadLabel(payload: Record<string, unknown>) {
  for (const key of ['title', 'targetTitle', 'area', 'status', 'domain', 'knowledgeType', 'noteType']) {
    const value = payload[key]
    if (typeof value === 'string' && value) {
      return value
    }
  }

  return 'Update'
}

export function statusTone(status: string) {
  if (status === 'Weak') return 'bg-orange-100 text-orange-800 border-orange-200'
  if (status === 'Strong') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (status === 'Needs Review') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export function actionLabel(actionType: string) {
  if (actionType === 'upsert_knowledge') return 'Knowledge update'
  if (actionType === 'create_link') return 'Link suggestion'
  return actionType.replaceAll('_', ' ')
}
