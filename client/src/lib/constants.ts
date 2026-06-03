import type { WorkspaceData } from '../types/domain'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

export const minCanvasZoom = 0.55
export const maxCanvasZoom = 1.65
export const graphBoardKey = 'default'

export const relationOptions = [
  ['supports', 'Supports'],
  ['prerequisite', 'Prerequisite'],
  ['example_of', 'Example of'],
  ['contrasts', 'Contrasts'],
  ['duplicate_candidate', 'Duplicate candidate'],
  ['related_concept', 'Related concept'],
  ['contrasts_with', 'Contrasts with'],
  ['part_of', 'Part of'],
] as const

export const emptyWorkspaceData: WorkspaceData = {
  rawNotes: [],
  rawSources: [],
  sourceOrganization: { projects: [] },
  topics: [],
  proposals: [],
  compiledNotes: [],
  noteLinks: [],
  noteCardPositions: [],
  agentRuns: [],
}
