import type React from 'react'
import {
  Activity,
  Map,
  Moon,
  PencilLine,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react'
import type { ActiveView, ThemeMode } from '../types/domain'
import type { AgentActivitySummary } from '../features/agent-runs/AgentActivityCenter'

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-gray-300 bg-white text-ink hover:bg-gray-50"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function LeftNavigation({
  activeView,
  agentActivitySummary,
  pendingCount,
  onAgentActivityClick,
  onCaptureClick,
  onKnowledgeMapClick,
  onSourcesClick,
  onUpdateProposalsClick,
  themeMode,
}: {
  activeView: ActiveView
  agentActivitySummary: AgentActivitySummary
  pendingCount: number
  onAgentActivityClick: () => void
  onCaptureClick: () => void
  onKnowledgeMapClick: () => void
  onSourcesClick: () => void
  onUpdateProposalsClick: () => void
  themeMode: ThemeMode
}) {
  const isDark = themeMode === 'dark'
  const navItemClass = (isActive: boolean) =>
    `flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] ${
      isActive
        ? isDark
          ? 'bg-[#2A2A2A] font-semibold text-white'
          : 'bg-slate-100 font-semibold text-ink'
        : isDark
          ? 'text-gray-300'
          : 'text-gray-600'
    }`

  return (
    <aside
      className={`flex h-screen w-[252px] shrink-0 flex-col gap-[18px] border-r px-[18px] py-6 ${
        isDark
          ? 'border-[#2B2B2B] bg-ink text-white'
          : 'border-gray-200 bg-white text-ink'
      }`}
    >
      <div className="space-y-1">
        <p className="text-lg font-bold leading-5">Knowledge</p>
        <p className="text-lg font-bold leading-5">Compiler</p>
      </div>

      <button
        className="flex h-11 items-center gap-2 rounded-lg bg-violet px-3.5 text-sm font-bold text-white"
        onClick={onCaptureClick}
        type="button"
      >
        <Plus size={18} />
        Capture source
      </button>

      <nav className="space-y-1.5">
        <p className="px-2 text-[11px] font-semibold tracking-wide text-gray-400">WORKSPACE</p>
        <button
          className={navItemClass(activeView === 'knowledge_map')}
          onClick={onKnowledgeMapClick}
          type="button"
        >
          <Map size={16} />
          Notes network
        </button>
        <button
          className={navItemClass(activeView === 'source_editor')}
          onClick={onSourcesClick}
          type="button"
        >
          <PencilLine size={16} className="text-gray-400" />
          Sources
        </button>
        <button
          className={navItemClass(activeView === 'update_proposals')}
          onClick={onUpdateProposalsClick}
          type="button"
        >
          <Sparkles size={16} className="text-gray-400" />
          Update proposals
          {pendingCount > 0 ? (
            <span className="ml-auto rounded-full bg-violet px-2 py-0.5 text-[11px] font-bold text-white">
              {pendingCount}
            </span>
          ) : null}
        </button>
        <button
          className={navItemClass(activeView === 'agent_activity')}
          onClick={onAgentActivityClick}
          type="button"
        >
          <Activity size={16} className="text-gray-400" />
          Agent activity
          {agentActivitySummary.running + agentActivitySummary.needsReview + agentActivitySummary.failed > 0 ? (
            <span className="ml-auto rounded-full bg-violet px-2 py-0.5 text-[11px] font-bold text-white">
              {agentActivitySummary.running + agentActivitySummary.needsReview + agentActivitySummary.failed}
            </span>
          ) : null}
        </button>
      </nav>

      <div
        className={`mt-auto rounded-lg border px-3 py-2 text-[11px] font-semibold ${
          isDark ? 'border-[#343434] bg-[#262626] text-gray-400' : 'border-gray-200 bg-slate-50 text-gray-500'
        }`}
      >
        Local workspace
      </div>
    </aside>
  )
}

export function TopToolbar({
  activeView,
  agentActivitySummary,
  agentRunStatus,
  compiledCount,
  isAgentRunning,
  noteCount,
  onAgentActivityClick,
  onReindexLinks,
  onSearchQueryChange,
  onSearchSubmit,
  onThemeToggle,
  pendingCount,
  searchQuery,
  themeMode,
}: {
  activeView: ActiveView
  agentActivitySummary: AgentActivitySummary
  agentRunStatus: string
  noteCount: number
  compiledCount: number
  isAgentRunning: boolean
  onAgentActivityClick: () => void
  onReindexLinks: () => void
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: () => void
  onThemeToggle: () => void
  pendingCount: number
  searchQuery: string
  themeMode: ThemeMode
}) {
  const agentAttentionCount =
    agentActivitySummary.running + agentActivitySummary.needsReview + agentActivitySummary.failed
  const pageCopy = {
    knowledge_map: {
      title: 'Notes network',
      subtitle: `${noteCount} sources -> ${compiledCount} compiled notes. Open a card to inspect links.`,
    },
    source_editor: {
      title: 'Sources',
      subtitle: 'Capture evidence, organize projects, and index reusable knowledge.',
    },
    update_proposals: {
      title: 'Update proposals',
      subtitle: `${pendingCount} proposals need review.`,
    },
    agent_activity: {
      title: 'Agent activity',
      subtitle: `${agentActivitySummary.running} running, ${agentActivitySummary.needsReview} need review, ${agentActivitySummary.failed} failed.`,
    },
  } satisfies Record<ActiveView, { title: string; subtitle: string }>
  const copy = pageCopy[activeView]
  const isDark = themeMode === 'dark'

  return (
    <header className="flex h-[72px] items-center gap-4 border-b border-gray-300 bg-white px-6">
      {activeView === 'knowledge_map' ? (
        <form
          className="flex h-10 w-[360px] items-center gap-2.5 rounded-lg border border-gray-300 bg-canvas px-3.5 text-[13px] text-gray-500 focus-within:border-violet focus-within:bg-white"
          onSubmit={(event) => {
            event.preventDefault()
            onSearchSubmit()
          }}
        >
          <Search size={16} />
          <input
            aria-label="Search knowledge"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-gray-500"
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search knowledge and evidence..."
            type="search"
            value={searchQuery}
          />
        </form>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-bold text-ink">{copy.title}</h1>
        <p className="truncate text-xs text-gray-500">{copy.subtitle}</p>
      </div>

      {activeView === 'knowledge_map' ? (
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-lg bg-ink px-3.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isAgentRunning}
          onClick={onReindexLinks}
        >
          <RotateCw size={16} />
          {isAgentRunning ? 'Re-indexing' : 'Re-index links'}
        </button>
      ) : null}
      <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-500">
        Agent {agentRunStatus}
      </span>
      <button
        aria-label="Open agent activity"
        className="relative grid h-10 w-10 place-items-center rounded-lg border border-gray-300 bg-white text-ink hover:bg-gray-50"
        onClick={onAgentActivityClick}
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
      <IconButton
        label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={onThemeToggle}
      >
        {isDark ? <Moon size={18} /> : <Sun size={18} />}
      </IconButton>
    </header>
  )
}
