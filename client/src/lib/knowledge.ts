export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function payloadText(payload: Record<string, unknown>, key: string, fallback = '') {
  const value = payload[key]
  return typeof value === 'string' ? value : fallback
}

export function payloadLabel(payload: Record<string, unknown>) {
  for (const key of ['title', 'targetTitle', 'area', 'status', 'knowledgeType', 'noteType']) {
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
