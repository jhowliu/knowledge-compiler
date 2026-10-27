import { Activity, Bot, Moon, PencilLine, Plus, Search, Sparkles, Sun } from 'lucide-react'
import type { ActiveView, ThemeMode } from '../types/domain'
import type { AgentActivitySummary } from '../features/agent-runs/AgentActivityCenter'
import { IconButton, Pill, pluralize } from './ui'

export function agentAttentionCount(summary: AgentActivitySummary) {
  return summary.running + summary.needsReview + summary.failed
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto min-w-[22px] rounded-full bg-violet px-1.5 text-center text-[11px] font-bold leading-5 tabular-nums text-white">
      {count}
    </span>
  )
}

/** Brand, capture action and primary navigation, shared by every full-height sidebar. */
export function PrimaryNavigation({
  activeView,
  agentActivitySummary,
  pendingCount,
  onAgentActivityClick,
  onCaptureClick,
  onSourcesClick,
  onUpdateProposalsClick,
}: {
  activeView: ActiveView
  agentActivitySummary: AgentActivitySummary
  pendingCount: number
  onAgentActivityClick: () => void
  onCaptureClick: () => void
  onSourcesClick: () => void
  onUpdateProposalsClick: () => void
}) {
  const items = [
    { view: 'source_editor', label: 'Sources', icon: PencilLine, onClick: onSourcesClick, count: 0 },
    {
      view: 'update_proposals',
      label: 'Review queue',
      icon: Sparkles,
      onClick: onUpdateProposalsClick,
      count: pendingCount,
    },
    {
      view: 'agent_activity',
      label: 'Agent activity',
      icon: Activity,
      onClick: onAgentActivityClick,
      count: agentAttentionCount(agentActivitySummary),
    },
  ] satisfies Array<{
    view: ActiveView
    label: string
    icon: typeof Activity
    onClick: () => void
    count: number
  }>

  return (
    <>
      <div className="space-y-1">
        <p className="text-lg font-bold leading-5">Knowledge</p>
        <p className="text-lg font-bold leading-5">Compiler</p>
      </div>

      <button
        className="flex h-11 items-center gap-2 rounded-lg bg-violet px-3.5 text-sm font-bold text-white hover:bg-violet-dark"
        onClick={onCaptureClick}
        type="button"
      >
        <Plus aria-hidden size={18} />
        Capture source
      </button>

      <nav aria-label="Primary" className="space-y-1">
        {items.map(({ view, label, icon: Icon, onClick, count }) => {
          const isActive = activeView === view
          return (
            <button
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] ${
                isActive
                  ? 'bg-slate-100 font-semibold text-ink'
                  : 'text-gray-600 hover:bg-slate-50 hover:text-ink'
              }`}
              key={view}
              onClick={onClick}
              type="button"
            >
              <Icon aria-hidden size={16} className={isActive ? 'text-accent' : 'text-gray-500'} />
              {label}
              <NavBadge count={count} />
            </button>
          )
        })}
      </nav>
    </>
  )
}

export function LeftNavigation(props: Parameters<typeof PrimaryNavigation>[0]) {
  return (
    <aside className="flex h-screen w-[252px] shrink-0 flex-col gap-[18px] border-r border-gray-200 bg-surface px-[18px] py-6 text-ink">
      <PrimaryNavigation {...props} />
      <p className="mt-auto rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-xs font-medium text-gray-500">
        Local workspace
      </p>
    </aside>
  )
}

export function ThemeToggle({ onClick, themeMode }: { onClick: () => void; themeMode: ThemeMode }) {
  const isDark = themeMode === 'dark'
  return (
    <IconButton label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onClick}>
      {isDark ? <Moon aria-hidden size={18} /> : <Sun aria-hidden size={18} />}
    </IconButton>
  )
}

export function TopToolbar({
  activeView,
  agentActivitySummary,
  agentRunStatus,
  onAgentActivityClick,
  onAskClick,
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
  onAgentActivityClick: () => void
  onAskClick: () => void
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: () => void
  onThemeToggle: () => void
  pendingCount: number
  searchQuery: string
  themeMode: ThemeMode
}) {
  const pageCopy = {
    source_editor: {
      title: 'Sources',
      subtitle: 'Capture evidence and index reusable knowledge.',
    },
    update_proposals: {
      title: 'Review queue',
      subtitle: pendingCount
        ? `${pluralize(pendingCount, 'proposal')} waiting for review.`
        : 'Nothing waiting for review.',
    },
    agent_activity: {
      title: 'Agent activity',
      subtitle: `${agentActivitySummary.running} running, ${agentActivitySummary.needsReview} need review, ${agentActivitySummary.failed} failed.`,
    },
  } satisfies Record<ActiveView, { title: string; subtitle: string }>
  const copy = pageCopy[activeView]
  const runTone =
    agentRunStatus === 'failed'
      ? 'danger'
      : agentRunStatus === 'running' || agentRunStatus === 'queued'
        ? 'accent'
        : 'neutral'

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-gray-300 bg-surface px-6">
      <form
        className="flex h-10 w-[360px] shrink-0 items-center gap-2.5 rounded-lg border border-gray-300 bg-canvas px-3.5 text-[13px] text-gray-500 focus-within:border-violet focus-within:bg-surface focus-within:ring-2 focus-within:ring-violet/20"
        onSubmit={(event) => {
          event.preventDefault()
          onSearchSubmit()
        }}
        role="search"
      >
        <Search aria-hidden size={16} />
        <input
          aria-label="Search knowledge"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-gray-500"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search knowledge and evidence..."
          type="search"
          value={searchQuery}
        />
      </form>
      <button
        className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-surface px-3 text-[13px] font-bold text-ink hover:bg-gray-50"
        onClick={onAskClick}
        type="button"
      >
        <Bot aria-hidden size={16} />
        Ask
      </button>

      <div className="min-w-0 flex-1">
        <div className="hidden xl:block">
          <p className="truncate text-[15px] font-bold text-ink">{copy.title}</p>
          <p className="truncate text-xs text-gray-500">{copy.subtitle}</p>
        </div>
      </div>

      <Pill tone={runTone}>Agent {agentRunStatus}</Pill>
      <IconButton
        badge={agentAttentionCount(agentActivitySummary)}
        label="Open agent activity"
        onClick={onAgentActivityClick}
      >
        <Activity aria-hidden size={18} />
      </IconButton>
      <ThemeToggle onClick={onThemeToggle} themeMode={themeMode} />
    </header>
  )
}
