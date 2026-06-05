import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  FileText,
  Folder,
  Inbox,
  Map as MapIcon,
  Moon,
  PanelRight,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { MarkdownPreview } from '../../components/MarkdownPreview'
import type { AgentActivitySummary } from '../agent-runs/AgentActivityCenter'
import type {
  AgentRun,
  Proposal,
  RawSource,
  RawSourceRole,
  SourceIndexingTrace,
  SourceProject,
  ThemeMode,
  Topic,
} from '../../types/domain'

type SourceLifecycle = {
  label: string
  tone: 'idle' | 'active' | 'pending' | 'done' | 'failed'
}

type RoleFilter = 'all' | RawSourceRole
type LifecycleFilter = 'all' | SourceLifecycle['tone']
type FolderFilter = 'all' | 'uncategorized' | string

function getRunSourceId(agentRun: AgentRun) {
  if (!agentRun.input || typeof agentRun.input !== 'object') {
    return null
  }

  const input = agentRun.input as { rawSourceId?: unknown }
  return typeof input.rawSourceId === 'string' ? input.rawSourceId : null
}

function getLifecycle(source: RawSource, proposals: Proposal[], agentRuns: AgentRun[]): SourceLifecycle {
  const sourceProposals = proposals.filter((proposal) => proposal.rawSourceId === source.id)
  const sourceRuns = agentRuns.filter((agentRun) => getRunSourceId(agentRun) === source.id)
  const hasActiveRun = sourceRuns.some((agentRun) => ['queued', 'running'].includes(agentRun.status))
  const latestProposal = sourceProposals[0] ?? null
  const latestFailedRun = sourceRuns.find((agentRun) => agentRun.status === 'failed')

  if (hasActiveRun) {
    return { label: 'Indexing', tone: 'active' }
  }

  if (latestFailedRun && !latestProposal) {
    return { label: 'Failed', tone: 'failed' }
  }

  if (latestProposal?.status === 'approved') {
    return { label: 'Applied', tone: 'done' }
  }

  if (latestProposal?.status === 'rejected') {
    return { label: 'Rejected', tone: 'failed' }
  }

  if (latestProposal?.status === 'pending') {
    return { label: 'Needs approval', tone: 'pending' }
  }

  return { label: 'Captured', tone: 'idle' }
}

function lifecycleClass(tone: SourceLifecycle['tone']) {
  return {
    idle: 'border-gray-200 bg-slate-100 text-gray-600',
    active: 'border-violet/30 bg-violet/10 text-violet',
    pending: 'border-amber-200 bg-amber-50 text-amber-800',
    done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    failed: 'border-red-200 bg-red-50 text-red-700',
  }[tone]
}

function roleLabel(role: RawSourceRole) {
  return role === 'reference' ? 'Reference' : 'Personal note'
}

function sourceTypeLabel(sourceType: string) {
  return sourceType.replaceAll('_', ' ')
}

function sourceTitle(source: RawSource | null | undefined) {
  return source?.title ?? 'Untitled source'
}

function projectSourceCount(project: SourceProject | undefined, fallbackCount: number) {
  return project?.sourceCount ?? fallbackCount
}

function formatDate(value: string | undefined) {
  if (!value) return 'Draft'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function SourceGroupButton({
  active,
  count,
  depth = 0,
  expanded,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean
  count?: number
  depth?: number
  expanded: boolean
  icon: typeof Inbox
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-semibold ${
        active ? 'bg-slate-100 text-ink' : 'text-gray-600 hover:bg-slate-50 hover:text-ink'
      }`}
      onClick={onClick}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      type="button"
    >
      <ChevronDown
        className={`shrink-0 transition ${expanded ? 'rotate-0' : '-rotate-90'}`}
        size={13}
      />
      <Icon size={15} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === 'number' ? (
        <span className="text-[11px] font-bold text-gray-400">{count}</span>
      ) : null}
    </button>
  )
}

function SourceSidebarItem({
  isSelected,
  lifecycle,
  onSelect,
  source,
  topics,
}: {
  isSelected: boolean
  lifecycle: SourceLifecycle
  onSelect: () => void
  source: RawSource
  topics: Topic[]
}) {
  const sourceTopics = topics.filter((topic) => source.topicIds.includes(topic.id))
  return (
    <div
      className={`ml-6 w-[calc(100%-1.5rem)] rounded-md border px-2.5 py-2 text-left transition ${
        isSelected
          ? 'border-violet bg-violet/10'
          : 'border-transparent hover:border-gray-200 hover:bg-slate-50'
      }`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500">
          {source.sourceRole === 'reference' ? <BookOpen size={13} /> : <FileText size={13} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-extrabold leading-5 text-ink">
            {sourceTitle(source)}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap gap-1">
            <span className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500">
              {formatDate(source.updatedAt)}
            </span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${lifecycleClass(lifecycle.tone)}`}
            >
              {lifecycle.label}
            </span>
            {sourceTopics.map((topic) => (
              <span
                className="rounded-full border border-violet/30 bg-violet/10 px-1.5 py-0.5 text-[9px] font-bold text-violet"
                key={topic.id}
                style={topic.color ? { borderColor: `${topic.color}40`, backgroundColor: `${topic.color}18`, color: topic.color } : undefined}
              >
                {topic.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SmallPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
      {children}
    </span>
  )
}

export function SourceEditorPage({
  indexingTrace,
  rawSources,
  sourceProjects,
  topics,
  proposals,
  agentRuns,
  selectedSourceId,
  isDirty,
  title,
  sourceRole,
  topicIds,
  bodyMarkdown,
  isSubmitting,
  notice,
  error,
  themeMode,
  titleInputRef,
  onTitleChange,
  onBodyChange,
  onSourceRoleChange,
  onTopicIdsChange,
  onNewNote,
  onSelectSource,
  onSave,
  onDelete,
  onSubmit,
  onCreateProject,
  onCreateFolder,
  onRenameProject,
  onRenameFolder,
  onDeleteProject,
  onDeleteFolder,
  onMoveSource,
  onApplyTopics,
  onCreateTopic,
  onOpenKnowledgeMap,
  onOpenAgentActivity,
  onOpenReviewQueue,
  onThemeToggle,
  agentActivitySummary,
}: {
  indexingTrace: SourceIndexingTrace | null
  rawSources: RawSource[]
  sourceProjects: SourceProject[]
  topics: Topic[]
  proposals: Proposal[]
  agentRuns: AgentRun[]
  selectedSourceId: string | null
  isDirty: boolean
  title: string
  sourceRole: RawSourceRole
  topicIds: string[]
  bodyMarkdown: string
  isSubmitting: boolean
  notice: string | null
  error: string | null
  themeMode: ThemeMode
  titleInputRef: React.RefObject<HTMLInputElement | null>
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onSourceRoleChange: (value: RawSourceRole) => void
  onTopicIdsChange: (topicIds: string[]) => void
  onNewNote: () => void
  onSelectSource: (source: RawSource) => void
  onSave: () => void
  onDelete: () => void
  onSubmit: (event: React.FormEvent) => void
  onCreateProject: (name: string) => void
  onCreateFolder: (projectId: string, name: string) => void
  onRenameProject: (projectId: string, name: string) => void
  onRenameFolder: (projectId: string, folderId: string, name: string) => void
  onDeleteProject: (projectId: string) => void
  onDeleteFolder: (projectId: string, folderId: string) => void
  onMoveSource: (rawSourceId: string, input: { projectId: string; folderId: string | null }) => void
  onApplyTopics: (rawSourceId: string, topicIds: string[]) => void
  onCreateTopic: (name: string) => Promise<Topic | null>
  onOpenKnowledgeMap?: () => void
  onOpenAgentActivity: () => void
  onOpenReviewQueue?: () => void
  onThemeToggle: () => void
  agentActivitySummary: AgentActivitySummary
}) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('all')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<FolderFilter>('all')
  const [newProjectName, setNewProjectName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [renameProjectName, setRenameProjectName] = useState('')
  const [renameFolderName, setRenameFolderName] = useState('')
  const [moveProjectId, setMoveProjectId] = useState('')
  const [moveFolderId, setMoveFolderId] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [expandedSourceGroups, setExpandedSourceGroups] = useState<string[]>(['all'])
  const [topicInput, setTopicInput] = useState('')
  const selectedSource = rawSources.find((source) => source.id === selectedSourceId) ?? null
  const selectedChunks = selectedSource?.chunks ?? []
  const selectedLifecycle = selectedSource
    ? getLifecycle(selectedSource, proposals, agentRuns)
    : { label: 'Draft', tone: 'idle' as const }
  const pendingCount = proposals.filter((proposal) => proposal.status === 'pending').length
  const agentAttentionCount =
    agentActivitySummary.running + agentActivitySummary.needsReview + agentActivitySummary.failed
  const selectedProject = sourceProjects.find((project) => project.id === selectedProjectId)
  const selectedFolder =
    selectedFolderFilter === 'all' || selectedFolderFilter === 'uncategorized'
      ? null
      : selectedProject?.folders.find((folder) => folder.id === selectedFolderFilter) ?? null
  const canDeleteSelectedProject =
    selectedProject !== undefined &&
    selectedProject.metadata.system !== 'default' &&
    selectedProject.sourceCount === 0 &&
    selectedProject.folders.length === 0
  const canDeleteSelectedFolder = Boolean(selectedFolder) && selectedFolder?.sourceCount === 0
  const moveProject = sourceProjects.find((project) => project.id === moveProjectId)

  useEffect(() => {
    if (selectedProjectId !== 'all' && !sourceProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId('all')
      setSelectedFolderFilter('all')
    }
  }, [selectedProjectId, sourceProjects])

  useEffect(() => {
    if (
      selectedFolderFilter !== 'all' &&
      selectedFolderFilter !== 'uncategorized' &&
      !selectedProject?.folders.some((folder) => folder.id === selectedFolderFilter)
    ) {
      setSelectedFolderFilter('all')
    }
  }, [selectedFolderFilter, selectedProject])

  useEffect(() => {
    setMoveProjectId(selectedSource?.projectId ?? sourceProjects[0]?.id ?? '')
    setMoveFolderId(selectedSource?.folderId ?? '')
  }, [selectedSource?.folderId, selectedSource?.projectId, sourceProjects])

  useEffect(() => {
    setTopicInput('')
  }, [selectedSource?.id])

  useEffect(() => {
    setRenameProjectName(selectedProject?.name ?? '')
  }, [selectedProject?.id, selectedProject?.name])

  useEffect(() => {
    setRenameFolderName(selectedFolder?.name ?? '')
  }, [selectedFolder?.id, selectedFolder?.name])

  const sourceRows = useMemo(() => {
    return rawSources.map((source) => {
      const lifecycle = getLifecycle(source, proposals, agentRuns)
      return { lifecycle, source }
    })
  }, [agentRuns, proposals, rawSources])

  const filterVisibleRows = (rows: typeof sourceRows) =>
    rows.filter(({ lifecycle, source }) => {
      const matchesRole = roleFilter === 'all' || source.sourceRole === roleFilter
      const matchesLifecycle = lifecycleFilter === 'all' || lifecycle.tone === lifecycleFilter
      return matchesRole && matchesLifecycle
    })
  const filteredSourceRows = filterVisibleRows(sourceRows)
  const sourceGroupIsExpanded = (key: string) => expandedSourceGroups.includes(key)
  const toggleSourceGroup = (key: string) => {
    setExpandedSourceGroups((groups) =>
      groups.includes(key) ? groups.filter((group) => group !== key) : [...groups, key],
    )
  }
  const toggleTopSourceGroup = (key: string) => {
    setExpandedSourceGroups((groups) => {
      const topLevelGroups = new Set(['all', ...sourceProjects.map((project) => `project:${project.id}`)])
      const withoutTopLevel = groups.filter((group) => !topLevelGroups.has(group))
      return groups.includes(key) ? withoutTopLevel : [...withoutTopLevel, key]
    })
  }
  const rowsForFolder = (folderId: string) =>
    filterVisibleRows(sourceRows.filter(({ source }) => source?.folderId === folderId))
  const rowsForUncategorized = (projectId: string) =>
    filterVisibleRows(
      sourceRows.filter(({ source }) => source?.projectId === projectId && !source.folderId),
    )

  const activeProposal = indexingTrace?.proposals[0] ?? null
  const pendingTopicsChanged =
    selectedSource !== null &&
    JSON.stringify([...topicIds].sort()) !==
      JSON.stringify([...(selectedSource?.topicIds ?? [])].sort())
  const filteredTopics = topics.filter((topic) =>
    topicInput.trim() ? topic.name.toLowerCase().includes(topicInput.toLowerCase()) : true,
  )
  const canCreateNewTopic =
    topicInput.trim().length > 0 &&
    !topics.some((topic) => topic.name.toLowerCase() === topicInput.trim().toLowerCase())
  const canMoveSource =
    Boolean(selectedSource) &&
    Boolean(moveProjectId) &&
    (selectedSource?.projectId !== moveProjectId || (selectedSource?.folderId ?? '') !== moveFolderId)
  const isDark = themeMode === 'dark'
  const appNavClass = (isActive: boolean) =>
    `flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] ${
      isActive
        ? isDark
          ? 'bg-[#2A2A2A] font-semibold text-white'
          : 'bg-slate-100 font-semibold text-ink'
        : isDark
          ? 'text-gray-300 hover:bg-[#2A2A2A]'
          : 'text-gray-600 hover:bg-slate-50 hover:text-ink'
    }`

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] bg-canvas text-ink">
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-gray-200 bg-white px-[18px] py-6">
        <div className="shrink-0">
          <div className="space-y-1">
            <p className="text-lg font-bold leading-5 text-ink">Knowledge</p>
            <p className="text-lg font-bold leading-5 text-ink">Compiler</p>
          </div>

          <button
            className="mt-[18px] flex h-11 w-full items-center gap-2 rounded-lg bg-violet px-3.5 text-sm font-bold text-white"
            onClick={onNewNote}
            type="button"
          >
            <Plus size={18} />
            Capture source
          </button>

          <nav className="mt-[18px] space-y-1.5">
            <p className="px-2 text-[11px] font-semibold tracking-wide text-gray-400">NAVIGATION</p>
            <button className={appNavClass(false)} onClick={onOpenKnowledgeMap} type="button">
              <MapIcon size={16} />
              Notes network
            </button>
            <button className={appNavClass(true)} type="button">
              <PencilLine size={16} className="text-gray-400" />
              Sources
            </button>
            <button className={appNavClass(false)} onClick={onOpenReviewQueue} type="button">
              <Sparkles size={16} className="text-gray-400" />
              Update proposals
              {pendingCount > 0 ? (
                <span className="ml-auto rounded-full bg-violet px-2 py-0.5 text-[11px] font-bold text-white">
                  {pendingCount}
                </span>
              ) : null}
            </button>
            <button className={appNavClass(false)} onClick={onOpenAgentActivity} type="button">
              <Activity size={16} className="text-gray-400" />
              Agent activity
              {agentAttentionCount > 0 ? (
                <span className="ml-auto rounded-full bg-violet px-2 py-0.5 text-[11px] font-bold text-white">
                  {agentAttentionCount}
                </span>
              ) : null}
            </button>
          </nav>
        </div>

        <div className="mt-5 shrink-0 px-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Projects</p>
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <SourceGroupButton
            active={selectedProjectId === 'all'}
            count={filteredSourceRows.length}
            expanded={sourceGroupIsExpanded('all')}
            icon={Inbox}
            label="All sources"
            onClick={() => {
              setSelectedProjectId('all')
              setSelectedFolderFilter('all')
              toggleTopSourceGroup('all')
            }}
          />
          {sourceGroupIsExpanded('all') ? (
            <div className="space-y-1">
              {filteredSourceRows.map(({ lifecycle, source }) => (
                <SourceSidebarItem
                  isSelected={source.id === selectedSourceId}
                  key={source.id}
                  lifecycle={lifecycle}
                  onSelect={() => onSelectSource(source)}
                  source={source}
                  topics={topics}
                />
              ))}
            </div>
          ) : null}

          {sourceProjects.map((project) => {
            const projectKey = `project:${project.id}`
            const uncategorizedKey = `uncategorized:${project.id}`
            const uncategorizedRows = rowsForUncategorized(project.id)

            return (
              <div className="space-y-1" key={project.id}>
                <SourceGroupButton
                  active={selectedProjectId === project.id && selectedFolderFilter === 'all'}
                  count={projectSourceCount(
                    project,
                    rawSources.filter((source) => source.projectId === project.id).length,
                  )}
                  expanded={sourceGroupIsExpanded(projectKey)}
                  icon={Folder}
                  label={project.name}
                  onClick={() => {
                    setSelectedProjectId(project.id)
                    setSelectedFolderFilter('all')
                    toggleTopSourceGroup(projectKey)
                  }}
                />
                {sourceGroupIsExpanded(projectKey) ? (
                  <div className="space-y-1">
                    <SourceGroupButton
                      active={selectedProjectId === project.id && selectedFolderFilter === 'uncategorized'}
                      count={project.uncategorizedSourceCount}
                      depth={1}
                      expanded={sourceGroupIsExpanded(uncategorizedKey)}
                      icon={Inbox}
                      label="Uncategorized"
                      onClick={() => {
                        setSelectedProjectId(project.id)
                        setSelectedFolderFilter('uncategorized')
                        toggleSourceGroup(uncategorizedKey)
                      }}
                    />
                    {sourceGroupIsExpanded(uncategorizedKey) ? (
                      <div className="space-y-1">
                        {uncategorizedRows.map(({ lifecycle, source }) => (
                          <SourceSidebarItem
                            isSelected={source.id === selectedSourceId}
                            key={source.id}
                            lifecycle={lifecycle}
                            onSelect={() => onSelectSource(source)}
                            source={source}
                            topics={topics}
                          />
                        ))}
                      </div>
                    ) : null}

                    {project.folders.map((folder) => {
                      const folderKey = `folder:${folder.id}`
                      const folderRows = rowsForFolder(folder.id)

                      return (
                        <div className="space-y-1" key={folder.id}>
                          <SourceGroupButton
                            active={selectedProjectId === project.id && selectedFolderFilter === folder.id}
                            count={folder.sourceCount}
                            depth={1}
                            expanded={sourceGroupIsExpanded(folderKey)}
                            icon={Folder}
                            label={folder.name}
                            onClick={() => {
                              setSelectedProjectId(project.id)
                              setSelectedFolderFilter(folder.id)
                              toggleSourceGroup(folderKey)
                            }}
                          />
                          {sourceGroupIsExpanded(folderKey) ? (
                            <div className="space-y-1">
                              {folderRows.map(({ lifecycle, source }) => (
                                <SourceSidebarItem
                                  isSelected={source.id === selectedSourceId}
                                  key={source.id}
                                  lifecycle={lifecycle}
                                  onSelect={() => onSelectSource(source)}
                                  source={source}
                                  topics={topics}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}

          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmedName = newProjectName.trim()
              if (!trimmedName) return
              onCreateProject(trimmedName)
              setNewProjectName('')
            }}
          >
            <input
              aria-label="New project name"
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-ink outline-none placeholder:text-gray-400"
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="New project"
              value={newProjectName}
            />
            <button
              aria-label="Create project"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-slate-50 disabled:opacity-50"
              disabled={isSubmitting || !newProjectName.trim()}
              title="Create project"
              type="submit"
            >
              <Plus size={14} />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-gray-300 bg-white px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold text-ink">Sources</h1>
            <p className="truncate text-xs text-gray-500">
              {rawSources.length} sources, {filteredSourceRows.length} visible with current filters.
            </p>
          </div>
          <button
            aria-label="Open agent activity"
            className="relative grid h-10 w-10 place-items-center rounded-lg border border-gray-300 bg-white text-ink hover:bg-gray-50"
            onClick={onOpenAgentActivity}
            title="Open agent activity"
            type="button"
          >
            <Activity size={18} />
            {agentAttentionCount > 0 ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-violet px-1.5 py-0.5 text-[10px] font-bold text-white">
                {agentAttentionCount}
              </span>
            ) : null}
          </button>
          <button
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid h-10 w-10 place-items-center rounded-lg border border-gray-300 bg-white text-ink hover:bg-gray-50"
            onClick={onThemeToggle}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            type="button"
          >
            {isDark ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_232px]">
      <form className="flex min-h-0 min-w-0 flex-col bg-white" onSubmit={onSubmit}>
        <header className="shrink-0 border-b border-gray-200 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {selectedSource ? (isDirty ? 'Unsaved changes' : 'Saved source') : 'New source'}
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${lifecycleClass(selectedLifecycle.tone)}`}
              >
                {indexingTrace?.status ?? selectedLifecycle.label}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-extrabold text-ink">
              {selectedSource ? sourceTitle(selectedSource) : 'Capture source evidence'}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter sources by role"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-ink outline-none"
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              value={roleFilter}
            >
              <option value="all">All roles</option>
              <option value="personal_note">Personal</option>
              <option value="reference">Reference</option>
            </select>
            <select
              aria-label="Filter sources by status"
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold text-ink outline-none"
              onChange={(event) => setLifecycleFilter(event.target.value as LifecycleFilter)}
              value={lifecycleFilter}
            >
              <option value="all">All states</option>
              <option value="idle">Captured</option>
              <option value="active">Indexing</option>
              <option value="pending">Needs approval</option>
              <option value="done">Applied</option>
              <option value="failed">Failed</option>
            </select>
            <div className="flex h-9 rounded-lg border border-gray-200 bg-slate-50 p-1">
              {[
                { value: 'personal_note' as const, label: 'Personal', icon: PencilLine },
                { value: 'reference' as const, label: 'Reference', icon: BookOpen },
              ].map((option) => {
                const Icon = option.icon
                return (
                  <button
                    className={`flex items-center gap-1.5 rounded-md px-2.5 text-[12px] font-extrabold transition ${
                      sourceRole === option.value ? 'bg-white text-ink shadow-sm' : 'text-gray-500 hover:text-ink'
                    }`}
                    key={option.value}
                    onClick={() => onSourceRoleChange(option.value)}
                    type="button"
                  >
                    <Icon size={14} />
                    {option.label}
                  </button>
                )
              })}
            </div>
            <button
              aria-label={isPreviewOpen ? 'Hide preview' : 'Show preview'}
              className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-slate-50"
              onClick={() => setIsPreviewOpen((current) => !current)}
              title={isPreviewOpen ? 'Hide preview' : 'Show preview'}
              type="button"
            >
              {isPreviewOpen ? <PanelRight size={16} /> : <Eye size={16} />}
            </button>
            {selectedSource ? (
              <>
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-ink disabled:opacity-50"
                  disabled={isSubmitting || !isDirty}
                  onClick={onSave}
                  type="button"
                >
                  <Save size={14} />
                  Save
                </button>
                <button
                  aria-label="Delete source"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                  disabled={isSubmitting}
                  onClick={onDelete}
                  title="Delete source"
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </>
            ) : null}
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet px-3 text-xs font-extrabold text-white disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              <Sparkles size={14} />
              {isSubmitting ? 'Indexing' : selectedSource ? 'Index source' : 'Save & index'}
            </button>
          </div>
        </header>

        {error ? (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        ) : null}
        {!filteredSourceRows.length && rawSources.length ? (
          <div className="mx-5 mt-4 rounded-lg border border-dashed border-gray-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-gray-600">
            No sources match the current filters. Adjust role or state filters in the header to widen the list.
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-[430px] flex-col px-6 py-5">
            <input
              aria-label="Source title"
              className="mb-4 h-11 w-full border-0 bg-transparent text-2xl font-extrabold tracking-normal text-ink outline-none placeholder:text-gray-400"
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Untitled source"
              ref={titleInputRef}
              value={title}
            />
            <textarea
              aria-label="Source body"
              className="min-h-0 flex-1 resize-none rounded-lg border border-transparent bg-transparent p-0 text-[15px] leading-7 text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-200 focus:bg-slate-50 focus:p-4"
              onChange={(event) => onBodyChange(event.target.value)}
              placeholder={
                sourceRole === 'reference'
                  ? 'Paste paper highlights, reference excerpts, or source notes.'
                  : 'Write notes here. Indexing will draft knowledge updates for review.'
              }
              value={bodyMarkdown}
            />
          </div>

          {isPreviewOpen ? (
            <aside className="border-t border-gray-200 bg-slate-50 px-5 py-5">
              <div className="mb-4 flex items-center gap-2 text-[13px] font-extrabold text-gray-600">
                <Eye size={15} />
                Preview
              </div>
              {title.trim() ? <h2 className="mb-4 text-xl font-extrabold text-ink">{title}</h2> : null}
              {bodyMarkdown.trim() ? (
                <MarkdownPreview markdown={bodyMarkdown} />
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm leading-6 text-gray-500">
                  Nothing to preview yet.
                </div>
              )}
            </aside>
          ) : null}
        </div>
      </form>

      <aside className="flex min-h-0 flex-col border-l border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Context</p>
          <h2 className="mt-1 text-sm font-extrabold text-ink">Indexing and chunks</h2>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {selectedProject ? (
            <section className="rounded-lg border border-gray-200 bg-slate-50 p-4">
              <p className="text-[12px] font-extrabold text-ink">Project tools</p>
              <form
                className="mt-3 flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  const trimmedName = renameProjectName.trim()
                  if (!trimmedName || trimmedName === selectedProject.name) return
                  onRenameProject(selectedProject.id, trimmedName)
                }}
              >
                <input
                  aria-label="Rename project"
                  className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-ink outline-none placeholder:text-gray-400"
                  onChange={(event) => setRenameProjectName(event.target.value)}
                  value={renameProjectName}
                />
                <button
                  aria-label="Save project name"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-slate-50 disabled:opacity-50"
                  disabled={
                    isSubmitting || !renameProjectName.trim() || renameProjectName.trim() === selectedProject.name
                  }
                  title="Save project name"
                  type="submit"
                >
                  <Save size={13} />
                </button>
                <button
                  aria-label="Delete project"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-white"
                  disabled={isSubmitting || !canDeleteSelectedProject}
                  onClick={() => {
                    if (!selectedProject || !canDeleteSelectedProject) return
                    onDeleteProject(selectedProject.id)
                  }}
                  title={canDeleteSelectedProject ? 'Delete empty project' : 'Only empty custom projects can be deleted'}
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </form>

              {selectedFolder ? (
                <form
                  className="mt-2 flex gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const trimmedName = renameFolderName.trim()
                    if (!trimmedName || trimmedName === selectedFolder.name) return
                    onRenameFolder(selectedProject.id, selectedFolder.id, trimmedName)
                  }}
                >
                  <input
                    aria-label="Rename folder"
                    className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-ink outline-none placeholder:text-gray-400"
                    onChange={(event) => setRenameFolderName(event.target.value)}
                    value={renameFolderName}
                  />
                  <button
                    aria-label="Save folder name"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-slate-50 disabled:opacity-50"
                    disabled={
                      isSubmitting || !renameFolderName.trim() || renameFolderName.trim() === selectedFolder.name
                    }
                    title="Save folder name"
                    type="submit"
                  >
                    <Save size={13} />
                  </button>
                  <button
                    aria-label="Delete folder"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-white"
                    disabled={isSubmitting || !canDeleteSelectedFolder}
                    onClick={() => {
                      if (!selectedProject || !selectedFolder || !canDeleteSelectedFolder) return
                      onDeleteFolder(selectedProject.id, selectedFolder.id)
                    }}
                    title={canDeleteSelectedFolder ? 'Delete empty folder' : 'Only empty folders can be deleted'}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </form>
              ) : null}

              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault()
                  const trimmedName = newFolderName.trim()
                  if (!trimmedName) return
                  onCreateFolder(selectedProject.id, trimmedName)
                  setNewFolderName('')
                }}
              >
                <input
                  aria-label="New folder name"
                  className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-ink outline-none placeholder:text-gray-400"
                  onChange={(event) => setNewFolderName(event.target.value)}
                  placeholder="New folder"
                  value={newFolderName}
                />
                <button
                  aria-label="Create folder"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-slate-50 disabled:opacity-50"
                  disabled={isSubmitting || !newFolderName.trim()}
                  title="Create folder"
                  type="submit"
                >
                  <Plus size={14} />
                </button>
              </form>
            </section>
          ) : null}

          <section className="rounded-lg border border-gray-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[12px] font-extrabold text-ink">Lifecycle</p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${lifecycleClass(selectedLifecycle.tone)}`}
              >
                {selectedLifecycle.label}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold uppercase">
              {([
                ['Saved', Boolean(selectedSource)],
                ['Chunked', selectedChunks.length > 0],
                ['Indexed', indexingTrace ? indexingTrace.agentRuns.length > 0 : false],
                ['Review', indexingTrace ? indexingTrace.proposals.length > 0 : false],
              ] as Array<[string, boolean]>).map(([label, isReady]) => (
                <div
                  className={`rounded-md border px-1.5 py-2 ${
                    isReady
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-white text-gray-400'
                  }`}
                  key={label}
                >
                  {isReady ? <CheckCircle2 className="mx-auto mb-1" size={13} /> : <Clock3 className="mx-auto mb-1" size={13} />}
                  {label}
                </div>
              ))}
            </div>
          </section>

          {selectedSource && indexingTrace ? (
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[12px] font-extrabold text-ink">Index trace</p>
                <SmallPill>{indexingTrace.agentRuns[0]?.status ?? 'idle'}</SmallPill>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Runs', indexingTrace.agentRuns.length],
                  ['Proposals', indexingTrace.proposals.length],
                  ['Items', indexingTrace.proposals[0]?.items.length ?? 0],
                ].map(([label, value]) => (
                  <div className="rounded-md border border-gray-200 bg-slate-50 p-2" key={label}>
                    <p className="text-[10px] font-bold uppercase text-gray-500">{label}</p>
                    <p className="mt-1 text-base font-extrabold text-ink">{value}</p>
                  </div>
                ))}
              </div>
              {activeProposal ? (
                <p className="mt-3 text-xs leading-5 text-gray-600">
                  {activeProposal.rationale ?? 'Proposal generated from this source.'}
                </p>
              ) : indexingTrace.status === 'Failed' ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                  {indexingTrace.agentRuns[0]?.error ?? 'LLM wiki indexing failed. No proposal was created.'}
                </p>
              ) : (
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Index this source to draft a proposal.
                </p>
              )}
            </section>
          ) : null}

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[12px] font-extrabold text-ink">Chunks</p>
              <SmallPill>{selectedChunks.length}</SmallPill>
            </div>
            {selectedChunks.length ? (
              <div className="space-y-2">
                {selectedChunks.map((chunk) => (
                  <details className="rounded-md border border-gray-200 bg-slate-50 p-3" key={chunk.id}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[12px] font-extrabold text-ink">
                        {chunk.heading ?? `Chunk ${chunk.chunkIndex + 1}`}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase text-gray-500">
                        ~{chunk.tokenEstimate}
                        <ChevronDown size={12} />
                      </span>
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-gray-600">{chunk.bodyMarkdown}</p>
                  </details>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-gray-300 bg-slate-50 p-3 text-xs leading-5 text-gray-500">
                Save this source to create indexing chunks.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-slate-50 p-4">
            <p className="text-[12px] font-extrabold text-ink">Source metadata</p>
            <div className="mt-3 space-y-2 text-xs leading-5 text-gray-600">
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <Tag size={11} className="text-gray-500" />
                  <p className="text-[11px] font-bold uppercase text-gray-500">Topics</p>
                </div>
                {topicIds.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {topicIds.map((topicId) => {
                      const topic = topics.find((t) => t.id === topicId)
                      if (!topic) return null
                      return (
                        <span
                          className="flex items-center gap-1 rounded-full border border-violet/30 bg-violet/10 py-0.5 pl-2 pr-1 text-[10px] font-bold text-violet"
                          key={topicId}
                          style={topic.color ? { borderColor: `${topic.color}40`, backgroundColor: `${topic.color}18`, color: topic.color } : undefined}
                        >
                          {topic.name}
                          <button
                            className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-black/10"
                            onClick={() => onTopicIdsChange(topicIds.filter((id) => id !== topicId))}
                            type="button"
                          >
                            <X size={9} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                ) : null}
                <input
                  aria-label="Search or create topic"
                  className="h-7 w-full rounded-md border border-gray-200 bg-slate-50 px-2 text-xs font-semibold text-ink outline-none placeholder:text-gray-400 focus:border-violet/40 focus:bg-white"
                  onChange={(event) => setTopicInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || !canCreateNewTopic) return
                    event.preventDefault()
                    const trimmed = topicInput.trim()
                    void (async () => {
                      const newTopic = await onCreateTopic(trimmed)
                      if (newTopic) {
                        onTopicIdsChange([...topicIds, newTopic.id])
                      }
                      setTopicInput('')
                    })()
                  }}
                  placeholder="Search or create..."
                  value={topicInput}
                />
                {topicInput.trim() ? (
                  <div className="mt-1 max-h-28 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm">
                    {filteredTopics
                      .filter((topic) => !topicIds.includes(topic.id))
                      .map((topic) => (
                        <button
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-slate-50"
                          key={topic.id}
                          onClick={() => {
                            onTopicIdsChange([...topicIds, topic.id])
                            setTopicInput('')
                          }}
                          type="button"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-violet"
                            style={topic.color ? { backgroundColor: topic.color } : undefined}
                          />
                          {topic.name}
                        </button>
                      ))}
                    {canCreateNewTopic ? (
                      <button
                        className="flex w-full items-center gap-2 border-t border-gray-100 px-2 py-1.5 text-left text-xs font-semibold text-violet hover:bg-slate-50"
                        onClick={async () => {
                          const trimmed = topicInput.trim()
                          const newTopic = await onCreateTopic(trimmed)
                          if (newTopic) {
                            onTopicIdsChange([...topicIds, newTopic.id])
                          }
                          setTopicInput('')
                        }}
                        type="button"
                      >
                        <Plus size={12} />
                        Create "{topicInput.trim()}"
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {selectedSource ? (
                  <button
                    className={`mt-2 h-7 w-full rounded-md px-2 text-xs font-extrabold ${
                      pendingTopicsChanged
                        ? 'bg-ink text-white'
                        : 'border border-gray-200 bg-slate-100 text-gray-500'
                    }`}
                    disabled={isSubmitting || !pendingTopicsChanged}
                    onClick={() => onApplyTopics(selectedSource.id, topicIds)}
                    type="button"
                  >
                    {pendingTopicsChanged ? 'Apply topics' : 'Topics up to date'}
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] leading-5 text-gray-500">
                    Topics will be saved with this source.
                  </p>
                )}
              </div>

              {selectedSource ? (
                <div className="rounded-md border border-gray-200 bg-white p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase text-gray-500">Location</p>
                  <div className="space-y-2">
                    <select
                      aria-label="Move source to project"
                      className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs font-bold text-ink outline-none"
                      onChange={(event) => {
                        setMoveProjectId(event.target.value)
                        setMoveFolderId('')
                      }}
                      value={moveProjectId}
                    >
                      {sourceProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Move source to folder"
                      className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs font-bold text-ink outline-none"
                      onChange={(event) => setMoveFolderId(event.target.value)}
                      value={moveFolderId}
                    >
                      <option value="">Uncategorized</option>
                      {moveProject?.folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className={`h-8 w-full rounded-md px-2 text-xs font-extrabold ${
                        canMoveSource
                          ? 'bg-ink text-white'
                          : 'border border-gray-200 bg-slate-100 text-gray-500'
                      }`}
                      disabled={isSubmitting || !canMoveSource}
                      onClick={() => {
                        if (!selectedSource || !moveProjectId) return
                        onMoveSource(selectedSource.id, {
                          projectId: moveProjectId,
                          folderId: moveFolderId || null,
                        })
                      }}
                      type="button"
                    >
                      {canMoveSource ? 'Move source' : 'Current location'}
                    </button>
                  </div>
                </div>
              ) : null}

              <p>
                <span className="font-bold text-gray-500">Role:</span>{' '}
                {roleLabel(sourceRole)}
              </p>
              <p>
                <span className="font-bold text-gray-500">Type:</span>{' '}
                {sourceTypeLabel(selectedSource?.sourceType ?? (sourceRole === 'reference' ? 'paper' : 'manual'))}
              </p>
              <p>
                <span className="font-bold text-gray-500">Updated:</span>{' '}
                {formatDate(selectedSource?.updatedAt)}
              </p>
            </div>
          </section>
        </div>
      </aside>
      </div>
      </div>
    </section>
  )
}
