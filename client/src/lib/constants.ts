import type { WorkspaceData } from '../types/domain'

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

export const emptyWorkspaceData: WorkspaceData = {
  rawSources: [],
  proposals: [],
  compiledNotes: [],
  agentRuns: [],
}
