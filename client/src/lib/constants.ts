import type { BoardKey, WorkspaceData } from '../types/domain'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

export const minCanvasZoom = 0.55
export const maxCanvasZoom = 1.65

export const boardOptions: Array<{ key: BoardKey; label: string }> = [
  { key: 'default', label: 'Default' },
  { key: 'algorithms', label: 'Algorithms' },
  { key: 'review-maps', label: 'Review maps' },
]

export const relationOptions = [
  ['related_concept', 'Related concept'],
  ['prerequisite', 'Prerequisite'],
  ['example_of', 'Example of'],
  ['contrasts_with', 'Contrasts with'],
  ['part_of', 'Part of'],
] as const

export const emptyWorkspaceData: WorkspaceData = {
  rawNotes: [],
  rawSources: [],
  proposals: [],
  compiledNotes: [],
  noteLinks: [],
  noteCardPositions: [],
  agentRuns: [],
  reviewMaps: [],
}
