import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Check,
  Download,
  Eye,
  Filter,
  GitBranch,
  Layers3,
  Library,
  Link2,
  Map,
  PencilLine,
  Plus,
  RotateCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import './index.css'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

type ProposalStatus = 'pending' | 'approved' | 'rejected'
type ActiveView = 'knowledge_map' | 'raw_note_editor'

type RawNote = {
  id: string
  title: string | null
  domain: string | null
  bodyMarkdown: string
  createdAt: string
}

type ProposalItem = {
  id: string
  actionType: string
  targetType: string | null
  payload: Record<string, unknown>
  rationale: string | null
  status: ProposalStatus
}

type Proposal = {
  id: string
  rawNoteId: string | null
  detectedDomain: string | null
  detectedKnowledgeType: string | null
  impactLevel: number
  confidence: string
  status: ProposalStatus
  rationale: string | null
  items: ProposalItem[]
  createdAt: string
}

type CompiledNote = {
  id: string
  domain: string
  noteType: string
  title: string
  bodyMarkdown: string
  structuredData?: unknown
  updatedAt: string
}

type Mistake = {
  id: string
  domain: string
  category: string | null
  title: string
  description: string
  evidenceCount: number
}

type ReviewTask = {
  id: string
  domain: string
  title: string
  description: string
  status: string
}

type ReadinessItem = {
  id: string
  domain: string
  area: string
  status: string
  rationale: string | null
}

type WorkspaceData = {
  rawNotes: RawNote[]
  proposals: Proposal[]
  compiledNotes: CompiledNote[]
  reviewMaps: CompiledNote[]
  mistakes: Mistake[]
  reviewTasks: ReviewTask[]
  readinessItems: ReadinessItem[]
}

const emptyWorkspaceData: WorkspaceData = {
  rawNotes: [],
  proposals: [],
  compiledNotes: [],
  reviewMaps: [],
  mistakes: [],
  reviewTasks: [],
  readinessItems: [],
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
  }
}

async function loadWorkspaceData(): Promise<WorkspaceData> {
  const [rawNotes, proposals, compiledNotes, reviewMaps, mistakes, reviewTasks, readinessItems] =
    await Promise.all([
      requestJson<{ rawNotes: RawNote[] }>('/raw-notes'),
      requestJson<{ proposals: Proposal[] }>('/update-proposals'),
      requestJson<{ compiledNotes: CompiledNote[] }>('/compiled-notes'),
      requestJson<{ reviewMaps: CompiledNote[] }>('/review-maps'),
      requestJson<{ mistakes: Mistake[] }>('/mistakes'),
      requestJson<{ reviewTasks: ReviewTask[] }>('/review-tasks'),
      requestJson<{ readinessItems: ReadinessItem[] }>('/readiness-map'),
    ])

  return {
    rawNotes: rawNotes.rawNotes,
    proposals: proposals.proposals,
    compiledNotes: compiledNotes.compiledNotes,
    reviewMaps: reviewMaps.reviewMaps,
    mistakes: mistakes.mistakes,
    reviewTasks: reviewTasks.reviewTasks,
    readinessItems: readinessItems.readinessItems,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function reviewMapSummary(note: CompiledNote | undefined) {
  const structuredData = isRecord(note?.structuredData) ? note.structuredData : {}
  const decisionRules = Array.isArray(structuredData.decisionRules)
    ? structuredData.decisionRules
    : []
  const lines = decisionRules
    .map((rule) => {
      if (!isRecord(rule)) return null
      const signal = typeof rule.signal === 'string' ? rule.signal : ''
      const recommendation = typeof rule.recommendation === 'string' ? rule.recommendation : ''
      return signal && recommendation ? `${signal} -> ${recommendation}` : null
    })
    .filter((line): line is string => Boolean(line))

  if (lines.length) {
    return lines.slice(0, 4).join('. ')
  }

  return (
    note?.bodyMarkdown.slice(0, 180) ??
    'Weight = 1 -> BFS. Positive weights -> Dijkstra. All pairs -> Floyd-Warshall.'
  )
}

function payloadText(payload: Record<string, unknown>, key: string, fallback = '') {
  const value = payload[key]
  return typeof value === 'string' ? value : fallback
}

function payloadLabel(payload: Record<string, unknown>) {
  for (const key of ['title', 'area', 'status', 'domain', 'noteType']) {
    const value = payload[key]
    if (typeof value === 'string' && value) {
      return value
    }
  }

  return 'Update'
}

function statusTone(status: string) {
  if (status === 'Weak') return 'bg-orange-100 text-orange-800 border-orange-200'
  if (status === 'Strong') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (status === 'Needs Review') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function actionLabel(actionType: string) {
  return actionType.replaceAll('_', ' ')
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code className="rounded bg-[#303030] px-1.5 py-0.5 text-[13px] text-amber-100" key={index}>
          {part.slice(1, -1)}
        </code>
      )
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }

    return part
  })
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  const blocks: React.ReactNode[] = []
  let codeLines: string[] = []
  let inCodeBlock = false

  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(
          <pre
            className="my-4 overflow-x-auto rounded-lg border border-[#333333] bg-[#151515] p-4 text-xs leading-5 text-gray-200"
            key={`code-${index}`}
          >
            <code>{codeLines.join('\n')}</code>
          </pre>,
        )
        codeLines = []
      }
      inCodeBlock = !inCodeBlock
      return
    }

    if (inCodeBlock) {
      codeLines.push(line)
      return
    }

    if (!line.trim()) {
      blocks.push(<div className="h-3" key={`space-${index}`} />)
      return
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const className =
        level === 1
          ? 'mt-2 text-2xl font-bold text-white'
          : level === 2
            ? 'mt-2 text-xl font-bold text-white'
            : 'mt-2 text-base font-bold text-gray-100'
      blocks.push(
        <div className={className} key={`heading-${index}`}>
          {renderInlineMarkdown(heading[2])}
        </div>,
      )
      return
    }

    const quote = line.match(/^>\s+(.+)$/)
    if (quote) {
      blocks.push(
        <blockquote
          className="border-l-2 border-violet pl-3 text-[14px] italic leading-7 text-gray-300"
          key={`quote-${index}`}
        >
          {renderInlineMarkdown(quote[1])}
        </blockquote>,
      )
      return
    }

    const listItem = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/)
    if (listItem) {
      blocks.push(
        <div className="flex gap-2 text-[14px] leading-7 text-gray-200" key={`list-${index}`}>
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
          <p>{renderInlineMarkdown(listItem[1])}</p>
        </div>,
      )
      return
    }

    blocks.push(
      <p className="text-[14px] leading-7 text-gray-200" key={`paragraph-${index}`}>
        {renderInlineMarkdown(line)}
      </p>,
    )
  })

  return <div className="space-y-1">{blocks}</div>
}

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

function LeftNavigation({
  activeView,
  pendingCount,
  weakCount,
  reviewMapCount,
  onCaptureClick,
  onKnowledgeMapClick,
  onRawNotesClick,
}: {
  activeView: ActiveView
  pendingCount: number
  weakCount: number
  reviewMapCount: number
  onCaptureClick: () => void
  onKnowledgeMapClick: () => void
  onRawNotesClick: () => void
}) {
  const navItemClass = (isActive: boolean) =>
    `flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] ${
      isActive ? 'bg-[#2A2A2A] font-semibold text-white' : 'text-gray-300'
    }`

  return (
    <aside className="flex h-screen w-[252px] shrink-0 flex-col gap-[18px] bg-ink px-[18px] py-6 text-white">
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
        Capture raw note
      </button>

      <nav className="space-y-1.5">
        <p className="px-2 text-[11px] font-semibold tracking-wide text-gray-400">WORKSPACE</p>
        <button
          className={navItemClass(activeView === 'knowledge_map')}
          onClick={onKnowledgeMapClick}
          type="button"
        >
          <Map size={16} />
          Knowledge map
        </button>
        <button className={navItemClass(false)} type="button">
          <Library size={16} className="text-gray-400" />
          Review maps
          <span className="ml-auto text-[11px] font-bold text-gray-400">{reviewMapCount}</span>
        </button>
        <button
          className={navItemClass(activeView === 'raw_note_editor')}
          onClick={onRawNotesClick}
          type="button"
        >
          <PencilLine size={16} className="text-gray-400" />
          Raw notes
        </button>
        <button className={navItemClass(false)} type="button">
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
          <a className="flex h-8 items-center gap-2 px-2.5 text-[13px] text-gray-300" key={label}>
            <span className={`h-2 w-2 rounded-full ${color}`} />
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-auto rounded-lg bg-[#262626] p-3.5">
        <p className="mb-2 text-[13px] font-bold">Readiness</p>
        <p className="text-xs leading-5 text-gray-300">
          {weakCount || 0} weak areas need review today
        </p>
      </div>
    </aside>
  )
}

function TopToolbar({ noteCount, compiledCount, taskCount }: {
  noteCount: number
  compiledCount: number
  taskCount: number
}) {
  return (
    <header className="flex h-[72px] items-center gap-4 border-b border-gray-300 bg-white px-6">
      <div className="flex h-10 w-[420px] items-center gap-2.5 rounded-lg border border-gray-300 bg-canvas px-3.5 text-[13px] text-gray-500">
        <Search size={16} />
        Search notes, patterns, mistakes...
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-bold text-ink">Coding Knowledge Map</h1>
        <p className="text-xs text-gray-500">
          {noteCount} raw notes → {compiledCount} compiled notes → {taskCount} open actions
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
        className="flex h-10 items-center gap-2 rounded-lg bg-ink px-3.5 text-[13px] font-bold text-white"
      >
        <RotateCw size={16} />
        Run compiler
      </button>
    </header>
  )
}

function ClusterLabel({
  children,
  className,
  dotClassName,
}: {
  children: React.ReactNode
  className: string
  dotClassName: string
}) {
  return (
    <div className={`inline-flex h-[30px] items-center gap-2 rounded-2xl border px-3 text-xs font-bold ${className}`}>
      <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
      {children}
    </div>
  )
}

function MapCard({
  className = '',
  title,
  meta,
  children,
}: {
  className?: string
  title: string
  meta: string
  children: React.ReactNode
}) {
  return (
    <article className={`absolute max-h-[202px] overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-card ${className}`}>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">{meta}</p>
      <h3 className="mb-2 line-clamp-3 text-[15px] font-extrabold text-ink">{title}</h3>
      <div className="line-clamp-5 text-xs leading-5 text-gray-600">{children}</div>
    </article>
  )
}

function EvidenceTray({ rawNotes }: { rawNotes: RawNote[] }) {
  const snippets = rawNotes.slice(0, 3)

  return (
    <section className="absolute bottom-6 left-8 right-[392px] flex h-[124px] gap-3 rounded-lg border border-gray-300 bg-white p-3.5 shadow-card">
      <div className="w-[118px] shrink-0">
        <h2 className="text-sm font-extrabold text-ink">Evidence</h2>
        <p className="mt-1 text-[11px] leading-4 text-gray-500">Source-backed changes</p>
      </div>
      {(snippets.length ? snippets : [null, null, null]).map((snippet, index) => (
        <article
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-slate-50 p-3"
          key={snippet?.id ?? index}
        >
          <p className="mb-2 text-[11px] font-bold text-gray-500">
            {snippet ? snippet.title ?? 'Raw note' : ['LeetCode reflection', 'Mock feedback', 'Behavioral draft'][index]}
          </p>
          <p className="line-clamp-2 text-xs leading-5 text-ink">
            {snippet?.bodyMarkdown ??
              [
                '“I realized it should use Floyd-Warshall...”',
                'Capacity estimate missing from URL shortener pass.',
                'Strong action, but result is not quantified yet.',
              ][index]}
          </p>
        </article>
      ))}
    </section>
  )
}

function KnowledgeCanvas({
  data,
}: {
  data: WorkspaceData
}) {
  const primaryPattern = data.compiledNotes.find((note) => note.noteType === 'pattern')
  const primaryProblem = data.compiledNotes.find((note) => note.noteType === 'problem_note')
  const primaryReviewMap =
    data.reviewMaps[0] ?? data.compiledNotes.find((note) => note.noteType === 'review_map')
  const primaryMistake = data.mistakes[0]
  const primaryTask = data.reviewTasks[0]
  const primaryReadiness = data.readinessItems[0]

  return (
    <section className="relative h-full flex-1 overflow-hidden bg-canvas">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.32) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="absolute left-8 top-8">
        <ClusterLabel
          className="border-indigo-200 bg-indigo-50 text-indigo-800"
          dotClassName="bg-violet"
        >
          Coding patterns
        </ClusterLabel>
      </div>
      <div className="absolute left-[560px] top-[102px]">
        <ClusterLabel
          className="border-emerald-200 bg-emerald-50 text-emerald-800"
          dotClassName="bg-emerald-500"
        >
          Readiness
        </ClusterLabel>
      </div>
      <div className="absolute left-[356px] top-[512px]">
        <ClusterLabel
          className="border-orange-200 bg-orange-50 text-orange-800"
          dotClassName="bg-orange-400"
        >
          Mistakes & actions
        </ClusterLabel>
      </div>

      <div className="absolute left-[290px] top-[210px] h-0.5 w-[104px] rotate-[18deg] bg-indigo-300" />
      <div className="absolute left-[486px] top-[268px] h-0.5 w-[92px] -rotate-[24deg] bg-indigo-300" />
      <div className="absolute left-[420px] top-[370px] h-[178px] w-0.5 bg-orange-300" />
      <div className="absolute left-[526px] top-[190px] h-0.5 w-[70px] -rotate-[14deg] bg-emerald-300" />

      <MapCard
        className="left-12 top-20 w-[260px]"
        meta={primaryReviewMap?.noteType ?? 'review map'}
        title={primaryReviewMap?.title ?? 'Shortest Path Decision Guide'}
      >
        {reviewMapSummary(primaryReviewMap)}
      </MapCard>

      <MapCard
        className="left-[354px] top-[178px] w-[250px] border-indigo-200"
        meta={primaryPattern?.noteType ?? 'pattern'}
        title={primaryPattern?.title ?? 'All-Pairs Shortest Path'}
      >
        {primaryPattern?.bodyMarkdown.slice(0, 150) ??
          'Canonical pattern card. Recognition cues, common traps, and representative problems stay bounded here.'}
      </MapCard>

      <MapCard
        className="left-[552px] top-[330px] w-[248px]"
        meta={primaryProblem?.noteType ?? 'problem note'}
        title={primaryProblem?.title ?? '1334. Find the City'}
      >
        {primaryProblem?.bodyMarkdown.slice(0, 140) ??
          'Problem evidence connects back to the raw note and supports pattern readiness changes.'}
      </MapCard>

      <MapCard
        className="left-[584px] top-[138px] w-[228px] border-emerald-200"
        meta="readiness"
        title={primaryReadiness?.area ?? 'Graph shortest path'}
      >
        <span
          className={`mb-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${statusTone(
            primaryReadiness?.status ?? 'Weak',
          )}`}
        >
          {primaryReadiness?.status ?? 'Weak'}
        </span>
        <p>{primaryReadiness?.rationale ?? 'Needs two successful review passes before moving to Okay.'}</p>
      </MapCard>

      <MapCard
        className="left-[304px] top-[552px] w-[270px] border-orange-200"
        meta="mistake"
        title={primaryMistake?.title ?? 'Did not recognize APSP'}
      >
        {primaryMistake?.description ??
          'Personal recurring error lives in the mistake log, linked back to source evidence.'}
      </MapCard>

      <MapCard
        className="left-[582px] top-[564px] w-[230px] border-amber-200"
        meta="review task"
        title={primaryTask?.title ?? 'Practice 2 APSP problems'}
      >
        {primaryTask?.description ?? 'Actionable practice card generated from approved proposal.'}
      </MapCard>

      <EvidenceTray rawNotes={data.rawNotes} />
    </section>
  )
}

function RawNoteEditorPage({
  rawNotes,
  selectedRawNoteId,
  isDirty,
  title,
  bodyMarkdown,
  isSubmitting,
  notice,
  error,
  titleInputRef,
  onTitleChange,
  onBodyChange,
  onNewNote,
  onSelectRawNote,
  onSave,
  onDelete,
  onSubmit,
}: {
  rawNotes: RawNote[]
  selectedRawNoteId: string | null
  isDirty: boolean
  title: string
  bodyMarkdown: string
  isSubmitting: boolean
  notice: string | null
  error: string | null
  titleInputRef: React.RefObject<HTMLInputElement | null>
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onNewNote: () => void
  onSelectRawNote: (note: RawNote) => void
  onSave: () => void
  onDelete: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const selectedRawNote = rawNotes.find((note) => note.id === selectedRawNoteId) ?? null

  return (
    <section className="flex min-h-0 flex-1 bg-[#181818] text-white">
      <aside className="flex w-[304px] shrink-0 flex-col border-r border-[#2B2B2B] bg-[#181818] px-5 py-6">
        <div className="mb-7 flex items-center gap-4">
          <PencilLine size={34} strokeWidth={1.9} className="text-gray-400" />
          <h1 className="text-[26px] font-semibold leading-none tracking-normal text-gray-100">
            Raw notes
          </h1>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Recent notes
          </p>
          <span className="rounded-full bg-[#2A2A2A] px-2 py-0.5 text-[11px] font-bold text-gray-300">
            {rawNotes.length}
          </span>
        </div>

        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {rawNotes.length ? (
            rawNotes.slice(0, 12).map((note) => (
              <button
                className={`w-full rounded-md border p-3 text-left transition ${
                  note.id === selectedRawNoteId
                    ? 'border-violet bg-[#252039]'
                    : 'border-[#2B2B2B] bg-[#202020] hover:border-[#3A3A3A]'
                }`}
                key={note.id}
                onClick={() => onSelectRawNote(note)}
                type="button"
              >
                <p className="line-clamp-1 text-[13px] font-bold text-gray-100">
                  {note.title ?? 'Untitled raw note'}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">
                  {note.bodyMarkdown}
                </p>
              </button>
            ))
          ) : (
            <p className="rounded-md border border-[#2B2B2B] bg-[#202020] p-3 text-xs leading-5 text-gray-400">
              No raw notes yet.
            </p>
          )}
        </div>
      </aside>

      <form className="flex min-w-0 flex-1 flex-col bg-[#202020]" onSubmit={onSubmit}>
        <header className="flex h-[78px] items-center justify-between gap-4 border-b border-[#303030] px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {selectedRawNote ? (isDirty ? 'Editing saved raw note' : 'Saved raw note') : 'New raw note'}
            </p>
            <h2 className="text-[15px] font-bold text-gray-100">
              {selectedRawNote?.title ?? 'Capture interview evidence'}
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              className="flex h-10 items-center gap-2 rounded-lg border border-[#3A3A3A] px-3.5 text-[13px] font-bold text-gray-200 hover:bg-[#2A2A2A]"
              onClick={onNewNote}
              type="button"
            >
              <Plus size={16} />
              New note
            </button>
            {selectedRawNote ? (
              <>
                <button
                  className="flex h-10 items-center gap-2 rounded-lg border border-[#3A3A3A] px-3.5 text-[13px] font-bold text-gray-200 hover:bg-[#2A2A2A] disabled:opacity-50"
                  disabled={isSubmitting || !isDirty}
                  onClick={onSave}
                  type="button"
                >
                  <Save size={16} />
                  Save
                </button>
                <button
                  aria-label="Delete raw note"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-red-900/70 text-red-200 hover:bg-red-950/40 disabled:opacity-50"
                  disabled={isSubmitting}
                  onClick={onDelete}
                  title="Delete raw note"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </>
            ) : null}
            <button
              className="flex h-10 items-center gap-2 rounded-lg bg-violet px-4 text-[13px] font-extrabold text-white disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              <Sparkles size={16} />
              {isSubmitting ? 'Compiling' : selectedRawNote ? 'Compile saved' : 'Compile note'}
            </button>
          </div>
        </header>

        {error ? (
          <div className="mx-8 mt-5 rounded-lg border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mx-8 mt-5 rounded-lg border border-emerald-900/60 bg-emerald-950/50 px-4 py-3 text-sm font-semibold text-emerald-100">
            {notice}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,1fr)_minmax(320px,0.9fr)] gap-0">
          <div className="flex min-h-0 flex-col px-8 py-7">
            <input
              aria-label="Raw note title"
              className="mb-5 h-14 w-full border-0 bg-transparent text-3xl font-semibold tracking-normal text-white outline-none placeholder:text-gray-600"
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Untitled raw note"
              ref={titleInputRef}
              value={title}
            />
            <textarea
              aria-label="Raw practice note"
              className="min-h-0 flex-1 resize-none border-0 bg-transparent text-[15px] leading-7 text-gray-200 outline-none placeholder:text-gray-600"
              onChange={(event) => onBodyChange(event.target.value)}
              placeholder="Write the messy version here. The compiler will turn it into proposal-backed knowledge after you compile."
              value={bodyMarkdown}
            />
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-[#303030] bg-[#1B1B1B] px-7 py-7">
            <div className="mb-5 flex items-center gap-2 text-[13px] font-bold text-gray-300">
              <Eye size={16} className="text-gray-500" />
              Preview
            </div>
            {title.trim() ? (
              <h2 className="mb-5 text-2xl font-bold tracking-normal text-white">{title}</h2>
            ) : null}
            {bodyMarkdown.trim() ? (
              <MarkdownPreview markdown={bodyMarkdown} />
            ) : (
              <div className="rounded-lg border border-dashed border-[#3A3A3A] p-4 text-sm leading-6 text-gray-500">
                Nothing to preview yet.
              </div>
            )}
          </aside>
        </div>
      </form>
    </section>
  )
}

function ProposalInspector({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: Proposal | null
  onApprove: (proposalId: string) => void
  onReject: (proposalId: string) => void
}) {
  const firstItem = proposal?.items[0]

  return (
    <aside className="h-full w-[360px] shrink-0 overflow-y-auto border-l border-gray-300 bg-white px-[18px] py-5">
      <div className="mb-4 space-y-1">
        <p className="text-[11px] font-bold tracking-wide text-violet">AI UPDATE PROPOSAL</p>
        <h2 className="text-xl font-extrabold text-ink">Compile raw note into knowledge</h2>
        <p className="text-xs leading-5 text-gray-500">
          {proposal
            ? `Detected ${proposal.detectedKnowledgeType ?? 'coding note'} · ${proposal.confidence} confidence`
            : 'No pending proposal selected'}
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-slate-50 p-3.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-gray-500">Domain</span>
          <strong className="text-[13px] text-ink">{proposal?.detectedDomain ?? 'Coding'}</strong>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-gray-500">Impact</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
            Level {proposal?.impactLevel ?? 2} · approval recommended
          </span>
        </div>
      </div>

      <section className="mb-4 space-y-2.5">
        <h3 className="text-sm font-extrabold text-ink">Suggested updates</h3>
        {proposal?.items.length ? (
          proposal.items.map((item, index) => (
            <article className="rounded-md border border-gray-200 bg-white p-3" key={item.id}>
              <p className="text-[13px] font-bold capitalize text-ink">
                {index + 1}. {actionLabel(item.actionType)}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-600">{payloadLabel(item.payload)}</p>
            </article>
          ))
        ) : (
          <p className="rounded-md border border-gray-200 bg-white p-3 text-xs leading-5 text-gray-500">
            Capture a raw note to generate a proposal.
          </p>
        )}
      </section>

      <section className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3.5">
        <h3 className="mb-2 text-[13px] font-extrabold text-indigo-800">Why</h3>
        <p className="text-xs leading-5 text-indigo-800">
          {proposal?.rationale ??
            'The compiler turns messy practice notes into clean, evidence-backed knowledge changes.'}
        </p>
      </section>

      <section className="mb-4 rounded-lg border border-gray-200 bg-slate-50 p-3.5">
        <h3 className="mb-2 text-[13px] font-extrabold text-ink">Readiness change</h3>
        <p className="text-xs leading-5 text-gray-600">
          {firstItem
            ? payloadText(firstItem.payload, 'rationale', 'Readiness updates remain linked to source evidence.')
            : 'Graph shortest path remains Weak until review tasks are completed.'}
        </p>
      </section>

      <section className="mb-4 space-y-2">
        <h3 className="text-sm font-extrabold text-ink">Evidence links</h3>
        {['Raw note · today', 'Shortest Path review map'].map((label) => (
          <div className="flex h-[38px] items-center gap-2 rounded-md border border-gray-200 px-2.5 text-xs text-gray-700" key={label}>
            <Link2 size={15} className="text-gray-500" />
            {label}
          </div>
        ))}
      </section>

      <div className="flex gap-2.5">
        <button
          className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-[13px] font-bold text-ink disabled:opacity-50"
          disabled={!proposal || proposal.status !== 'pending'}
          onClick={() => proposal && onReject(proposal.id)}
          type="button"
        >
          <X size={15} />
          Reject
        </button>
        <button
          className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-lg bg-violet text-[13px] font-extrabold text-white disabled:opacity-50"
          disabled={!proposal || proposal.status !== 'pending'}
          onClick={() => proposal && onApprove(proposal.id)}
          type="button"
        >
          <Check size={15} />
          Approve
        </button>
      </div>
    </aside>
  )
}

function App() {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [activeView, setActiveView] = useState<ActiveView>('knowledge_map')
  const [title, setTitle] = useState('')
  const [bodyMarkdown, setBodyMarkdown] = useState('')
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(emptyWorkspaceData)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [selectedRawNoteId, setSelectedRawNoteId] = useState<string | null>(null)
  const [isRawNoteDirty, setIsRawNoteDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedProposal = useMemo(() => {
    return (
      workspaceData.proposals.find((proposal) => proposal.id === selectedProposalId) ??
      workspaceData.proposals.find((proposal) => proposal.status === 'pending') ??
      workspaceData.proposals[0] ??
      null
    )
  }, [selectedProposalId, workspaceData.proposals])

  const pendingCount = workspaceData.proposals.filter((proposal) => proposal.status === 'pending').length
  const weakCount = workspaceData.readinessItems.filter((item) => item.status === 'Weak').length
  const openTaskCount = workspaceData.reviewTasks.filter((task) => task.status === 'open').length

  async function refresh() {
    setIsLoading(true)
    try {
      setWorkspaceData(await loadWorkspaceData())
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load workspace')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (activeView === 'raw_note_editor') {
      titleInputRef.current?.focus()
    }
  }, [activeView])

  function rawNotePayload() {
    return {
      title: title.trim() || null,
      bodyMarkdown,
    }
  }

  async function saveSelectedRawNote() {
    if (!selectedRawNoteId) {
      return null
    }

    if (!bodyMarkdown.trim()) {
      setError('Write a practice note first.')
      return null
    }

    setIsSubmitting(true)
    try {
      const result = await requestJson<{ rawNote: RawNote }>(`/raw-notes/${selectedRawNoteId}`, {
        method: 'PATCH',
        body: JSON.stringify(rawNotePayload()),
      })
      setSelectedRawNoteId(result.rawNote.id)
      setIsRawNoteDirty(false)
      setNotice('Raw note saved.')
      setError(null)
      await refresh()
      return result.rawNote
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save note')
      setNotice(null)
      return null
    } finally {
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedRawNote() {
    if (!selectedRawNoteId) {
      return
    }

    setIsSubmitting(true)
    try {
      await requestVoid(`/raw-notes/${selectedRawNoteId}`, { method: 'DELETE' })
      setTitle('')
      setBodyMarkdown('')
      setSelectedRawNoteId(null)
      setIsRawNoteDirty(false)
      setNotice('Raw note deleted.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to delete note')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitRawNote(event: React.FormEvent) {
    event.preventDefault()
    if (!bodyMarkdown.trim()) {
      setError('Write a practice note first.')
      return
    }

    setIsSubmitting(true)
    try {
      let result: { proposal: Proposal | null }
      const isCompilingSavedNote = Boolean(selectedRawNoteId)
      if (selectedRawNoteId) {
        if (isRawNoteDirty) {
          await requestJson<{ rawNote: RawNote }>(`/raw-notes/${selectedRawNoteId}`, {
            method: 'PATCH',
            body: JSON.stringify(rawNotePayload()),
          })
        }
        result = await requestJson<{ proposal: Proposal | null }>(
          `/raw-notes/${selectedRawNoteId}/compile`,
          {
            method: 'POST',
            body: JSON.stringify({}),
          },
        )
      } else {
        result = await requestJson<{ proposal: Proposal | null }>('/raw-notes', {
          method: 'POST',
          body: JSON.stringify(rawNotePayload()),
        })
      }
      setSelectedProposalId(result.proposal?.id ?? null)
      setSelectedRawNoteId(null)
      setIsRawNoteDirty(false)
      setTitle('')
      setBodyMarkdown('')
      setNotice(
        result.proposal
          ? isCompilingSavedNote
            ? 'Raw note compiled. Review the generated update proposal.'
            : 'Raw note captured. Review the generated update proposal.'
          : isCompilingSavedNote
            ? 'Raw note compiled.'
            : 'Raw note captured.',
      )
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save note')
      setNotice(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  function openRawNotesView() {
    setActiveView('raw_note_editor')
    setNotice(null)
    setError(null)
  }

  function openNewRawNoteEditor() {
    setTitle('')
    setBodyMarkdown('')
    setSelectedRawNoteId(null)
    setIsRawNoteDirty(false)
    openRawNotesView()
  }

  function selectRawNote(rawNote: RawNote) {
    setSelectedRawNoteId(rawNote.id)
    setTitle(rawNote.title ?? '')
    setBodyMarkdown(rawNote.bodyMarkdown)
    setIsRawNoteDirty(false)
    setNotice(null)
    setError(null)
  }

  function updateDraftTitle(value: string) {
    setTitle(value)
    setIsRawNoteDirty(true)
  }

  function updateDraftBody(value: string) {
    setBodyMarkdown(value)
    setIsRawNoteDirty(true)
  }

  async function decideProposal(proposalId: string, decision: 'approve' | 'reject') {
    await requestJson(`/update-proposals/${proposalId}/${decision}`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    await refresh()
  }

  return (
    <main className="flex h-screen min-w-[1180px] overflow-hidden bg-canvas text-ink">
      <LeftNavigation
        activeView={activeView}
        onCaptureClick={openNewRawNoteEditor}
        onKnowledgeMapClick={() => setActiveView('knowledge_map')}
        onRawNotesClick={openRawNotesView}
        pendingCount={pendingCount}
        reviewMapCount={workspaceData.reviewMaps.length}
        weakCount={weakCount}
      />
      <section className="flex min-w-0 flex-1 flex-col">
        {activeView === 'knowledge_map' ? (
          <>
            <TopToolbar
              compiledCount={workspaceData.compiledNotes.length}
              noteCount={workspaceData.rawNotes.length}
              taskCount={openTaskCount}
            />
            {error ? (
              <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="mx-6 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {notice}
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1">
              <KnowledgeCanvas data={workspaceData} />
              <ProposalInspector
                onApprove={(proposalId) => void decideProposal(proposalId, 'approve')}
                onReject={(proposalId) => void decideProposal(proposalId, 'reject')}
                proposal={selectedProposal}
              />
            </div>
          </>
        ) : (
          <RawNoteEditorPage
            bodyMarkdown={bodyMarkdown}
            error={error}
            isDirty={isRawNoteDirty}
            isSubmitting={isSubmitting || isLoading}
            notice={notice}
            onBodyChange={updateDraftBody}
            onDelete={() => void deleteSelectedRawNote()}
            onNewNote={openNewRawNoteEditor}
            onSave={() => void saveSelectedRawNote()}
            onSelectRawNote={selectRawNote}
            onSubmit={submitRawNote}
            onTitleChange={updateDraftTitle}
            rawNotes={workspaceData.rawNotes}
            selectedRawNoteId={selectedRawNoteId}
            title={title}
            titleInputRef={titleInputRef}
          />
        )}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
