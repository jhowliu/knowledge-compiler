import type React from 'react'
import {
  Download,
  Filter,
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

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-gray-300 bg-white text-ink hover:bg-gray-50"
    >
      {children}
    </button>
  )
}

export function LeftNavigation({
  activeView,
  themeMode,
  pendingCount,
  onCaptureClick,
  onKnowledgeMapClick,
  onRawNotesClick,
  onUpdateProposalsClick,
  onThemeToggle,
}: {
  activeView: ActiveView
  themeMode: ThemeMode
  pendingCount: number
  onCaptureClick: () => void
  onKnowledgeMapClick: () => void
  onRawNotesClick: () => void
  onUpdateProposalsClick: () => void
  onThemeToggle: () => void
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
        <p className="text-lg font-bold leading-5">Interview Knowledge</p>
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
          className={navItemClass(activeView === 'raw_note_editor')}
          onClick={onRawNotesClick}
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
      </nav>

      <nav className="space-y-1.5">
        <p className="px-2 text-[11px] font-semibold tracking-wide text-gray-400">DOMAINS</p>
        {[
          ['Coding / LeetCode', 'bg-violet'],
          ['System design', 'bg-emerald-500'],
          ['Behavioral stories', 'bg-amber-500'],
        ].map(([label, color]) => (
          <a
            className={`flex h-8 items-center gap-2 px-2.5 text-[13px] ${
              isDark ? 'text-gray-300' : 'text-gray-600'
            }`}
            key={label}
          >
            <span className={`h-2 w-2 rounded-full ${color}`} />
            {label}
          </a>
        ))}
      </nav>

      <button
        className={`mt-auto flex h-10 items-center justify-between rounded-lg border px-3 text-left text-[13px] font-bold ${
          isDark
            ? 'border-[#343434] bg-[#262626] text-gray-200'
            : 'border-gray-200 bg-slate-50 text-ink'
        }`}
        onClick={onThemeToggle}
        type="button"
      >
        <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
        {isDark ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </aside>
  )
}

export function TopToolbar({
  agentRunStatus,
  compiledCount,
  isAgentRunning,
  noteCount,
  onReindexLinks,
  onSearchQueryChange,
  onSearchSubmit,
  searchQuery,
}: {
  agentRunStatus: string
  noteCount: number
  compiledCount: number
  isAgentRunning: boolean
  onReindexLinks: () => void
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: () => void
  searchQuery: string
}) {
  return (
    <header className="flex h-[72px] items-center gap-4 border-b border-gray-300 bg-white px-6">
      <form
        className="flex h-10 w-[420px] items-center gap-2.5 rounded-lg border border-gray-300 bg-canvas px-3.5 text-[13px] text-gray-500 focus-within:border-violet focus-within:bg-white"
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

      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-bold text-ink">Notes Graph</h1>
        <p className="text-xs text-gray-500">
          {noteCount} sources {'->'} {compiledCount} compiled notes. Open a card to inspect links.
        </p>
      </div>

      <IconButton label="Filter">
        <Filter size={18} />
      </IconButton>
      <IconButton label="Export">
        <Download size={18} />
      </IconButton>
      <button
        type="button"
        className="flex h-10 items-center gap-2 rounded-lg bg-ink px-3.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isAgentRunning}
        onClick={onReindexLinks}
      >
        <RotateCw size={16} />
        {isAgentRunning ? 'Re-indexing' : 'Re-index links'}
      </button>
      <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-500">
        Agent {agentRunStatus}
      </span>
    </header>
  )
}
