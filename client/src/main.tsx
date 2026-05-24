import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight,
  BookOpen,
  Check,
  Download,
  Eye,
  Filter,
  GitBranch,
  Layers3,
  Library,
  Link2,
  Map,
  Moon,
  Network,
  PencilLine,
  Plus,
  RotateCw,
  Save,
  Search,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import './index.css'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

type ProposalStatus = 'pending' | 'approved' | 'rejected'
type NoteLinkStatus = 'pending' | 'approved' | 'rejected'
type ActiveView = 'knowledge_map' | 'raw_note_editor' | 'review_maps'
type ThemeMode = 'light' | 'dark'

type DecisionRule = {
  signal: string
  recommendation: string
  confidence: string
}

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

type NoteLink = {
  id: string
  sourceNoteType: string
  sourceNoteId: string
  sourceTitle: string | null
  targetNoteType: string
  targetNoteId: string
  targetTitle: string | null
  relationType: string
  confidence: string
  status: NoteLinkStatus
  rationale: string | null
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
  noteLinks: NoteLink[]
  reviewMaps: CompiledNote[]
  mistakes: Mistake[]
  reviewTasks: ReviewTask[]
  readinessItems: ReadinessItem[]
}

type RelatedNoteMatch = {
  note: CompiledNote
  score: number
  reason: string
  link?: NoteLink
}

const relationOptions = [
  ['related_concept', 'Related concept'],
  ['prerequisite', 'Prerequisite'],
  ['example_of', 'Example of'],
  ['contrasts_with', 'Contrasts with'],
  ['part_of', 'Part of'],
] as const

const emptyWorkspaceData: WorkspaceData = {
  rawNotes: [],
  proposals: [],
  compiledNotes: [],
  noteLinks: [],
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
  const [rawNotes, proposals, compiledNotes, noteLinks, reviewMaps, mistakes, reviewTasks, readinessItems] =
    await Promise.all([
      requestJson<{ rawNotes: RawNote[] }>('/raw-notes'),
      requestJson<{ proposals: Proposal[] }>('/update-proposals'),
      requestJson<{ compiledNotes: CompiledNote[] }>('/compiled-notes'),
      requestJson<{ noteLinks: NoteLink[] }>('/note-links'),
      requestJson<{ reviewMaps: CompiledNote[] }>('/review-maps'),
      requestJson<{ mistakes: Mistake[] }>('/mistakes'),
      requestJson<{ reviewTasks: ReviewTask[] }>('/review-tasks'),
      requestJson<{ readinessItems: ReadinessItem[] }>('/readiness-map'),
    ])

  return {
    rawNotes: rawNotes.rawNotes,
    proposals: proposals.proposals,
    compiledNotes: compiledNotes.compiledNotes,
    noteLinks: noteLinks.noteLinks,
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

function reviewMapDetails(note: CompiledNote | undefined) {
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
  themeMode,
  pendingCount,
  weakCount,
  reviewMapCount,
  onCaptureClick,
  onKnowledgeMapClick,
  onReviewMapsClick,
  onRawNotesClick,
  onThemeToggle,
}: {
  activeView: ActiveView
  themeMode: ThemeMode
  pendingCount: number
  weakCount: number
  reviewMapCount: number
  onCaptureClick: () => void
  onKnowledgeMapClick: () => void
  onReviewMapsClick: () => void
  onRawNotesClick: () => void
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
          Notes network
        </button>
        <button
          className={navItemClass(activeView === 'review_maps')}
          onClick={onReviewMapsClick}
          type="button"
        >
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

      <div className={`rounded-lg p-3.5 ${isDark ? 'bg-[#262626]' : 'bg-slate-100'}`}>
        <p className="mb-2 text-[13px] font-bold">Readiness</p>
        <p className={`text-xs leading-5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
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
        Search notes, links, evidence...
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-bold text-ink">Notes Graph</h1>
        <p className="text-xs text-gray-500">
          {noteCount} raw notes {'->'} {compiledCount} compiled notes. Open a card to inspect links.
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
        Re-index links
      </button>
    </header>
  )
}

function noteTypeLabel(noteType: string) {
  return noteType.replaceAll('_', ' ')
}

function noteTone(noteType: string) {
  if (noteType === 'review_map') return 'border-violet/40 bg-violet/10 text-violet'
  if (noteType === 'algorithm') return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  if (noteType === 'mistake') return 'border-orange-300 bg-orange-50 text-orange-800'
  return 'border-gray-300 bg-white text-gray-700'
}

function noteKeywords(note: CompiledNote | undefined) {
  if (!note) return []
  const text = `${note.title} ${note.bodyMarkdown}`.toLowerCase()
  const words = text.match(/[a-z][a-z0-9-]{2,}/g) ?? []
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'when',
    'that',
    'this',
    'should',
    'note',
    'review',
    'problem',
    'algorithm',
    'using',
  ])
  return [...new Set(words.filter((word) => !stopWords.has(word)))].slice(0, 10)
}

function mergeKnowledgeNotes(data: WorkspaceData) {
  const notes = new globalThis.Map<string, CompiledNote>()
  for (const note of data.compiledNotes) notes.set(note.id, note)
  for (const note of data.reviewMaps) notes.set(note.id, note)
  return [...notes.values()]
}

function connectedNoteId(link: NoteLink, noteId: string) {
  if (link.sourceNoteId === noteId) return link.targetNoteId
  if (link.targetNoteId === noteId) return link.sourceNoteId
  return null
}

function relationLabel(relationType: string) {
  return relationType.replaceAll('_', ' ')
}

function relationOptionLabel(relationType: string) {
  return relationOptions.find(([value]) => value === relationType)?.[1] ?? relationLabel(relationType)
}

function edgePath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x
  const bend = Math.max(8, Math.min(22, Math.abs(dx) * 0.45))
  const direction = dx >= 0 ? 1 : -1
  const c1x = start.x + bend * direction
  const c2x = end.x - bend * direction
  return `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`
}

function KnowledgeCanvas({
  data,
  onCreateNoteLink,
  onDecideNoteLink,
  onRemoveNoteLink,
  onUpdateNoteLink,
}: {
  data: WorkspaceData
  onCreateNoteLink: (input: { sourceNoteId: string; targetNoteId: string; relationType: string }) => void
  onDecideNoteLink: (linkId: string, decision: 'approve' | 'reject') => void
  onRemoveNoteLink: (linkId: string) => void
  onUpdateNoteLink: (linkId: string, relationType: string) => void
}) {
  const canvasRef = useRef<HTMLElement | null>(null)
  const notes = useMemo(() => mergeKnowledgeNotes(data), [data.compiledNotes, data.reviewMaps])
  const noteById = useMemo(() => new globalThis.Map(notes.map((note) => [note.id, note])), [notes])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkTargetId, setLinkTargetId] = useState('')
  const [manualRelationType, setManualRelationType] = useState<(typeof relationOptions)[number][0]>(
    'related_concept',
  )
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [dragState, setDragState] = useState<{
    noteId: string
    startClientX: number
    startClientY: number
    origin: { x: number; y: number }
  } | null>(null)
  const [connectState, setConnectState] = useState<{
    sourceNoteId: string
    start: { x: number; y: number }
    current: { x: number; y: number }
  } | null>(null)
  const selectedNote =
    notes.find((note) => note.id === selectedNoteId) ??
    data.reviewMaps[0] ??
    notes[0] ??
    null
  const selectedDetails = reviewMapDetails(selectedNote ?? undefined)
  const selectedKeywords = noteKeywords(selectedNote ?? undefined)
  const selectedNoteLinks = selectedNote
    ? data.noteLinks.filter(
        (link) =>
          link.sourceNoteType === 'compiled_note' &&
          link.targetNoteType === 'compiled_note' &&
          Boolean(connectedNoteId(link, selectedNote.id)),
      )
    : []
  const approvedLinkedNotes = selectedNoteLinks
    .filter((link) => link.status === 'approved')
    .map((link) => {
      const noteId = selectedNote ? connectedNoteId(link, selectedNote.id) : null
      const note = noteId ? noteById.get(noteId) : null
      return note
        ? {
            note,
            score: link.confidence === 'high' ? 10 : link.confidence === 'medium' ? 8 : 6,
            reason: relationLabel(link.relationType),
            link,
          }
        : null
    })
    .filter((match): match is RelatedNoteMatch & { link: NoteLink } => Boolean(match))
  const inferredRelatedNotes: RelatedNoteMatch[] = notes
    .filter((note) => note.id !== selectedNote?.id)
    .filter((note) => !approvedLinkedNotes.some((match) => match.note.id === note.id))
    .map((note) => {
      const noteText = `${note.title} ${note.bodyMarkdown}`.toLowerCase()
      const titleMatch = selectedNote ? noteText.includes(selectedNote.title.toLowerCase()) : false
      const algorithmMatch = selectedDetails.linkedAlgorithms.some((algorithm) =>
        noteText.includes(algorithm.toLowerCase()),
      )
      const keywordMatches = selectedKeywords.filter((keyword) => noteText.includes(keyword)).length
      return {
        note,
        score: (titleMatch ? 4 : 0) + (algorithmMatch ? 3 : 0) + keywordMatches,
        reason: titleMatch
          ? 'Backlink by title mention'
          : algorithmMatch
            ? 'Shares review-map algorithm'
            : keywordMatches > 1
              ? 'Shares indexed concepts'
              : 'Nearby compiled note',
      }
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
  const relatedNotes = [...approvedLinkedNotes, ...inferredRelatedNotes].slice(0, 5)
  const baseVisibleGraphNotes = notes.slice(0, 9)
  const visibleGraphNotes =
    selectedNote && !baseVisibleGraphNotes.some((note) => note.id === selectedNote.id)
      ? [...baseVisibleGraphNotes.slice(0, 8), selectedNote]
      : baseVisibleGraphNotes
  const graphPositions = [
    { x: 44, y: 48 },
    { x: 22, y: 31 },
    { x: 72, y: 31 },
    { x: 22, y: 68 },
    { x: 72, y: 68 },
    { x: 46, y: 80 },
    { x: 46, y: 20 },
    { x: 82, y: 50 },
    { x: 14, y: 50 },
  ]
  const graphNodes = visibleGraphNotes.map((note, index) => ({
    note,
    position: nodePositions[note.id] ?? graphPositions[index] ?? graphPositions[0],
    relation:
      note.id === selectedNote?.id
        ? 'selected'
        : relatedNotes.find((match) => match.note.id === note.id)?.reason ?? 'Nearby note',
    link: relatedNotes.find((match) => match.note.id === note.id && 'link' in match)?.link,
  }))
  const selectedGraphNode = graphNodes.find((node) => node.note.id === selectedNote?.id) ?? graphNodes[0]
  const approvedLinkRows = selectedNoteLinks
    .filter((link) => link.status === 'approved')
    .map((link) => {
      const otherId = selectedNote ? connectedNoteId(link, selectedNote.id) : null
      const note = otherId ? noteById.get(otherId) : null
      return note ? { link, note } : null
    })
    .filter((row): row is { link: NoteLink; note: CompiledNote } => Boolean(row))
  const rawEvidence = data.rawNotes
    .filter((note) => {
      const haystack = `${note.title ?? ''} ${note.bodyMarkdown}`.toLowerCase()
      return (
        (selectedNote ? haystack.includes(selectedNote.title.toLowerCase()) : false) ||
        selectedDetails.linkedAlgorithms.some((algorithm) => haystack.includes(algorithm.toLowerCase())) ||
        selectedKeywords.some((keyword) => haystack.includes(keyword))
      )
    })
    .slice(0, 4)
  const pendingSuggestions = data.proposals
    .filter((proposal) => proposal.status === 'pending')
    .slice(0, 3)
  const pendingNoteLinks = selectedNoteLinks.filter((link) => link.status === 'pending').slice(0, 5)
  const linkCandidateNotes = notes
    .filter((note) => note.id !== selectedNote?.id)
    .filter((note) => {
      const query = linkSearch.trim().toLowerCase()
      if (!query) return true
      return `${note.title} ${note.noteType} ${note.bodyMarkdown}`.toLowerCase().includes(query)
    })
    .slice(0, 12)
  const selectedLinkTargetId =
    linkTargetId && linkCandidateNotes.some((note) => note.id === linkTargetId)
      ? linkTargetId
      : (linkCandidateNotes[0]?.id ?? '')

  function submitManualLink(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedNote || !selectedLinkTargetId) {
      return
    }
    onCreateNoteLink({
      sourceNoteId: selectedNote.id,
      targetNoteId: selectedLinkTargetId,
      relationType: manualRelationType,
    })
    setLinkSearch('')
    setLinkTargetId('')
    setManualRelationType('related_concept')
  }

  function pointFromEvent(event: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 50, y: 50 }
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    }
  }

  function startDrag(event: React.PointerEvent, noteId: string, position: { x: number; y: number }) {
    const target = event.target as HTMLElement
    if (target.closest('[data-link-handle="true"]')) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedNoteId(noteId)
    setDragState({
      noteId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: position,
    })
  }

  function movePointer(event: React.PointerEvent) {
    if (connectState) {
      setConnectState({ ...connectState, current: pointFromEvent(event) })
      return
    }

    if (!dragState) {
      return
    }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    const nextPosition = {
      x: Math.min(86, Math.max(14, dragState.origin.x + ((event.clientX - dragState.startClientX) / rect.width) * 100)),
      y: Math.min(86, Math.max(16, dragState.origin.y + ((event.clientY - dragState.startClientY) / rect.height) * 100)),
    }
    setNodePositions((positions) => ({ ...positions, [dragState.noteId]: nextPosition }))
  }

  function finishPointer(event: React.PointerEvent) {
    if (connectState) {
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const targetCard = target?.closest('[data-note-id]') as HTMLElement | null
      const targetNoteId = targetCard?.dataset.noteId
      if (targetNoteId && targetNoteId !== connectState.sourceNoteId) {
        onCreateNoteLink({
          sourceNoteId: connectState.sourceNoteId,
          targetNoteId,
          relationType: 'related_concept',
        })
      }
    }
    setConnectState(null)
    setDragState(null)
  }

  return (
    <section className="flex min-h-0 flex-1 bg-canvas">
      <main
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerMove={movePointer}
        onPointerUp={finishPointer}
        ref={canvasRef}
      >
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.34) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />

        <div className="absolute left-7 top-6 z-20">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Graph view</p>
          <h2 className="mt-1 text-2xl font-extrabold text-ink">Notes as links</h2>
          <p className="mt-1 max-w-[340px] text-sm leading-6 text-gray-500">
            Cards stay lightweight. Open one to inspect body, evidence, and agent-suggested links.
          </p>
        </div>

        {selectedGraphNode ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            {graphNodes
              .filter((node) => node.note.id !== selectedGraphNode.note.id)
              .map((node) => {
                const labelX = (selectedGraphNode.position.x + node.position.x) / 2
                const labelY = (selectedGraphNode.position.y + node.position.y) / 2
                return (
                  <g key={`${selectedGraphNode.note.id}-${node.note.id}`}>
                    <path
                      d={edgePath(selectedGraphNode.position, node.position)}
                      fill="none"
                      stroke="rgba(99, 102, 241, 0.34)"
                      strokeDasharray={node.link ? undefined : '5 7'}
                      strokeWidth="0.45"
                      vectorEffect="non-scaling-stroke"
                    />
                    {node.link ? (
                      <text
                        dominantBaseline="middle"
                        fill="rgba(99, 102, 241, 0.88)"
                        fontSize="2.3"
                        fontWeight="700"
                        textAnchor="middle"
                        x={labelX}
                        y={labelY}
                      >
                        {relationOptionLabel(node.link.relationType)}
                      </text>
                    ) : null}
                  </g>
                )
              })}
            {connectState ? (
              <path
                d={edgePath(connectState.start, connectState.current)}
                fill="none"
                stroke="rgba(124, 58, 237, 0.82)"
                strokeDasharray="4 4"
                strokeWidth="0.7"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        ) : null}

        {graphNodes.length ? (
          graphNodes.map((node) => {
            const isSelected = node.note.id === selectedNote?.id
            return (
              <button
                className={`absolute z-10 w-[208px] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-3 text-left shadow-card transition hover:-translate-y-[calc(50%+2px)] ${
                  isSelected ? 'border-violet ring-4 ring-violet/10' : 'border-gray-200 hover:border-gray-300'
                }`}
                data-note-id={node.note.id}
                key={node.note.id}
                onClick={() => setSelectedNoteId(node.note.id)}
                onPointerDown={(event) => startDrag(event, node.note.id, node.position)}
                style={{ left: `${node.position.x}%`, top: `${node.position.y}%` }}
                type="button"
              >
                <span
                  className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-violet shadow-md"
                  data-link-handle="true"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSelectedNoteId(node.note.id)
                    setConnectState({
                      sourceNoteId: node.note.id,
                      start: { x: node.position.x + 4.8, y: node.position.y },
                      current: pointFromEvent(event),
                    })
                  }}
                />
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${noteTone(node.note.noteType)}`}>
                    {noteTypeLabel(node.note.noteType)}
                  </span>
                  {isSelected ? (
                    <GitBranch size={15} className="text-violet" />
                  ) : (
                    <Link2 size={14} className="text-gray-400" />
                  )}
                </div>
                <p className="line-clamp-2 text-[13px] font-extrabold leading-5 text-ink">
                  {node.note.title}
                </p>
                <p className="mt-2 line-clamp-1 text-[11px] font-semibold text-gray-500">
                  {node.relation}
                </p>
              </button>
            )
          })
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-500">
              Compile a raw note to start the graph.
            </p>
          </div>
        )}

        <div className="absolute bottom-6 left-7 z-10 flex gap-2">
          {[
            ['Notes', notes.length],
            ['Approved links', data.noteLinks.filter((link) => link.status === 'approved').length],
            ['Pending links', data.noteLinks.filter((link) => link.status === 'pending').length],
          ].map(([label, value]) => (
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm" key={label}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-0.5 text-lg font-extrabold text-ink">{value}</p>
            </div>
          ))}
        </div>
      </main>

      <aside className="flex w-[380px] shrink-0 flex-col border-l border-[#303030] bg-[#1B1B1B] text-white">
        {selectedNote ? (
          <>
            <header className="border-b border-[#303030] px-6 py-5">
              <span className="mb-3 inline-flex rounded-full border border-[#3A3A3A] bg-[#202020] px-2.5 py-1 text-[11px] font-bold capitalize text-gray-300">
                {noteTypeLabel(selectedNote.noteType)}
              </span>
              <h2 className="text-xl font-extrabold leading-7 text-white">{selectedNote.title}</h2>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  ['Links', relatedNotes.length],
                  ['Evidence', rawEvidence.length],
                  ['Queue', pendingNoteLinks.length + pendingSuggestions.length],
                ].map(([label, value]) => (
                  <div className="rounded-lg border border-[#303030] bg-[#202020] p-2" key={label}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
                    <p className="mt-1 text-lg font-extrabold text-white">{value}</p>
                  </div>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-gray-100">Content</h3>
                <div className="rounded-lg border border-[#303030] bg-[#202020] p-4">
                  <MarkdownPreview markdown={selectedNote.bodyMarkdown} />
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-100">
                  <Link2 size={15} className="text-violet" />
                  Related cards
                </h3>
                <div className="space-y-2">
                  {relatedNotes.length ? (
                    relatedNotes.map(({ note, reason }) => (
                      <button
                        className="w-full rounded-lg border border-[#303030] bg-[#202020] p-3 text-left hover:border-violet/50"
                        key={note.id}
                        onClick={() => setSelectedNoteId(note.id)}
                        type="button"
                      >
                        <p className="line-clamp-1 text-[13px] font-extrabold text-white">{note.title}</p>
                        <p className="mt-1 text-xs leading-5 text-gray-400">{reason}</p>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No related cards found yet.
                    </p>
                  )}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-100">
                  <GitBranch size={15} className="text-violet" />
                  Link management
                </h3>
                <div className="space-y-2">
                  {approvedLinkRows.length ? (
                    approvedLinkRows.map(({ link, note }) => (
                      <article className="rounded-lg border border-[#303030] bg-[#202020] p-3" key={link.id}>
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="line-clamp-1 text-[13px] font-extrabold text-white">{note.title}</p>
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                              Approved link
                            </p>
                          </div>
                          <button
                            className="rounded-md border border-[#3A3A3A] px-2 py-1 text-[11px] font-bold text-gray-300 hover:border-red-400 hover:text-red-200"
                            onClick={() => onRemoveNoteLink(link.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                        <select
                          className="h-9 w-full rounded-md border border-[#303030] bg-[#171717] px-3 text-xs font-semibold text-gray-100 outline-none focus:border-violet"
                          onChange={(event) => onUpdateNoteLink(link.id, event.target.value)}
                          value={link.relationType}
                        >
                          {relationOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      Drag from a card node to another card to create the first approved link.
                    </p>
                  )}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-100">
                  <Plus size={15} className="text-violet" />
                  Add link
                </h3>
                <form className="rounded-lg border border-[#303030] bg-[#202020] p-3" onSubmit={submitManualLink}>
                  <input
                    className="mb-2 h-9 w-full rounded-md border border-[#303030] bg-[#171717] px-3 text-xs font-semibold text-gray-100 outline-none focus:border-violet"
                    onChange={(event) => {
                      setLinkSearch(event.target.value)
                      setLinkTargetId('')
                    }}
                    placeholder="Search notes"
                    value={linkSearch}
                  />
                  <select
                    className="mb-2 h-9 w-full rounded-md border border-[#303030] bg-[#171717] px-3 text-xs font-semibold text-gray-100 outline-none focus:border-violet"
                    disabled={!linkCandidateNotes.length}
                    onChange={(event) => setLinkTargetId(event.target.value)}
                    value={selectedLinkTargetId}
                  >
                    {linkCandidateNotes.length ? (
                      linkCandidateNotes.map((note) => (
                        <option key={note.id} value={note.id}>
                          {note.title}
                        </option>
                      ))
                    ) : (
                      <option value="">No matching notes</option>
                    )}
                  </select>
                  <div className="flex gap-2">
                    <select
                      className="h-9 min-w-0 flex-1 rounded-md border border-[#303030] bg-[#171717] px-3 text-xs font-semibold text-gray-100 outline-none focus:border-violet"
                      onChange={(event) =>
                        setManualRelationType(event.target.value as (typeof relationOptions)[number][0])
                      }
                      value={manualRelationType}
                    >
                      {relationOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="inline-flex h-9 items-center gap-1 rounded-md bg-violet px-3 text-xs font-bold text-white hover:bg-violet-dark disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!selectedLinkTargetId}
                      type="submit"
                    >
                      <Plus size={13} />
                      Add
                    </button>
                  </div>
                </form>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-gray-100">Raw evidence</h3>
                <div className="space-y-2">
                  {rawEvidence.length ? (
                    rawEvidence.map((note) => (
                      <article className="rounded-lg border border-[#303030] bg-[#202020] p-3" key={note.id}>
                        <p className="line-clamp-1 text-[13px] font-extrabold text-white">
                          {note.title ?? 'Untitled raw note'}
                        </p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-gray-400">{note.bodyMarkdown}</p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No raw evidence found for this card.
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-100">
                  <Sparkles size={15} className="text-violet" />
                  Agent queue
                </h3>
                <div className="space-y-2">
                  {pendingSuggestions.length ? (
                    pendingSuggestions.map((proposal) => (
                      <article className="rounded-lg border border-violet/30 bg-violet/10 p-3" key={proposal.id}>
                        <p className="line-clamp-1 text-[13px] font-extrabold text-white">
                          {proposal.detectedKnowledgeType ?? 'knowledge update'}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-300">
                          {proposal.rationale ?? 'Review this proposal to approve new notes and links.'}
                        </p>
                      </article>
                    ))
                  ) : null}
                  {pendingNoteLinks.length ? (
                    pendingNoteLinks.map((link) => {
                      const otherId = selectedNote ? connectedNoteId(link, selectedNote.id) : null
                      const otherNote = otherId ? noteById.get(otherId) : null
                      return (
                        <article className="rounded-lg border border-violet/30 bg-violet/10 p-3" key={link.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="line-clamp-1 text-[13px] font-extrabold text-white">
                                {otherNote?.title ?? link.targetTitle ?? link.sourceTitle ?? 'Related note'}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-gray-300">
                                {link.rationale ?? `Suggested ${relationLabel(link.relationType)} link.`}
                              </p>
                            </div>
                            <span className="rounded-full border border-violet/30 px-2 py-0.5 text-[10px] font-bold uppercase text-violet">
                              {link.confidence}
                            </span>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              className="inline-flex items-center gap-1 rounded-md bg-violet px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-violet-dark"
                              onClick={() => onDecideNoteLink(link.id, 'approve')}
                              type="button"
                            >
                              <Check size={13} />
                              Approve
                            </button>
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-[#3A3A3A] px-2.5 py-1.5 text-[11px] font-bold text-gray-300 hover:border-gray-500"
                              onClick={() => onDecideNoteLink(link.id, 'reject')}
                              type="button"
                            >
                              <X size={13} />
                              Reject
                            </button>
                          </div>
                        </article>
                      )
                    })
                  ) : null}
                  {!pendingSuggestions.length && !pendingNoteLinks.length ? (
                    <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No pending link suggestions.
                    </p>
                  ) : (
                    null
                  )}
                </div>
              </section>
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <GitBranch className="mx-auto mb-4 text-gray-500" size={36} />
              <h2 className="text-lg font-extrabold text-white">No card selected</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">Select a graph card to open its content.</p>
            </div>
          </div>
        )}
      </aside>
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

function ReviewMapsPage({
  reviewMaps,
  rawNotes,
  compiledNotes,
  selectedReviewMapId,
  onSelectReviewMap,
}: {
  reviewMaps: CompiledNote[]
  rawNotes: RawNote[]
  compiledNotes: CompiledNote[]
  selectedReviewMapId: string | null
  onSelectReviewMap: (id: string) => void
}) {
  const selectedReviewMap = reviewMaps.find((mapNote) => mapNote.id === selectedReviewMapId) ?? reviewMaps[0]
  const details = reviewMapDetails(selectedReviewMap)
  const relatedAlgorithms = compiledNotes.filter(
    (note) =>
      note.noteType === 'algorithm' &&
      details.linkedAlgorithms.some((algorithm) => algorithm.toLowerCase() === note.title.toLowerCase()),
  )
  const relatedRawNotes = rawNotes
    .filter((note) => {
      const haystack = `${note.title ?? ''} ${note.bodyMarkdown}`.toLowerCase()
      return (
        selectedReviewMap?.title &&
        (haystack.includes(selectedReviewMap.title.toLowerCase()) ||
          details.linkedAlgorithms.some((algorithm) => haystack.includes(algorithm.toLowerCase())) ||
          details.decisionRules.some((rule) => haystack.includes(rule.recommendation.toLowerCase())))
      )
    })
    .slice(0, 4)

  return (
    <section className="flex min-h-0 flex-1 bg-[#181818] text-white">
      <aside className="flex w-[324px] shrink-0 flex-col border-r border-[#2B2B2B] bg-[#181818] px-5 py-6">
        <div className="mb-7 flex items-center gap-4">
          <Library size={34} strokeWidth={1.8} className="text-gray-400" />
          <h1 className="text-[26px] font-semibold leading-none tracking-normal text-gray-100">
            Review maps
          </h1>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Decision guides
          </p>
          <span className="rounded-full bg-[#2A2A2A] px-2 py-0.5 text-[11px] font-bold text-gray-300">
            {reviewMaps.length}
          </span>
        </div>

        <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
          {reviewMaps.length ? (
            reviewMaps.map((reviewMap) => {
              const mapDetails = reviewMapDetails(reviewMap)
              return (
                <button
                  className={`w-full rounded-md border p-3 text-left transition ${
                    reviewMap.id === selectedReviewMap?.id
                      ? 'border-violet bg-[#252039]'
                      : 'border-[#2B2B2B] bg-[#202020] hover:border-[#3A3A3A]'
                  }`}
                  key={reviewMap.id}
                  onClick={() => onSelectReviewMap(reviewMap.id)}
                  type="button"
                >
                  <p className="line-clamp-1 text-[13px] font-bold text-gray-100">
                    {reviewMap.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">
                    {reviewMapSummary(reviewMap)}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-gray-500">
                    <Network size={13} />
                    {mapDetails.decisionRules.length} rules
                  </div>
                </button>
              )
            })
          ) : (
            <div className="rounded-md border border-[#2B2B2B] bg-[#202020] p-4">
              <p className="text-sm font-bold text-gray-100">No review maps yet</p>
              <p className="mt-2 text-xs leading-5 text-gray-400">
                Approve a review-map proposal to see it here.
              </p>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-[#202020]">
        <header className="flex h-[78px] items-center justify-between gap-4 border-b border-[#303030] px-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Coding review map
            </p>
            <h2 className="truncate text-[18px] font-bold text-gray-100">
              {selectedReviewMap?.title ?? 'Select a review map'}
            </h2>
          </div>

          {selectedReviewMap ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#333333] bg-[#1B1B1B] px-3 py-2 text-xs font-bold text-gray-300">
              <Layers3 size={15} className="text-violet" />
              {details.linkedAlgorithms.length || details.decisionRules.length} linked signals
            </div>
          ) : null}
        </header>

        {selectedReviewMap ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(520px,1fr)_320px]">
            <main className="min-h-0 overflow-y-auto px-8 py-7">
              <section className="mb-6 rounded-lg border border-[#303030] bg-[#1B1B1B] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      Decision rules
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-white">Signal to approach</h3>
                  </div>
                  <span className="rounded-full border border-violet/40 bg-violet/15 px-3 py-1 text-xs font-bold text-violet">
                    {details.decisionRules.length} rules
                  </span>
                </div>

                {details.decisionRules.length ? (
                  <div className="overflow-hidden rounded-lg border border-[#303030]">
                    {details.decisionRules.map((rule, index) => (
                      <div
                        className="grid grid-cols-[minmax(160px,1fr)_44px_minmax(160px,1fr)_92px] items-center gap-3 border-b border-[#303030] bg-[#202020] px-4 py-3 last:border-b-0"
                        key={`${rule.signal}-${rule.recommendation}-${index}`}
                      >
                        <p className="break-words text-sm font-semibold leading-5 text-gray-100">
                          {rule.signal}
                        </p>
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-[#2A2A2A] text-gray-400">
                          <ArrowRight size={15} />
                        </div>
                        <p className="break-words text-sm font-bold leading-5 text-white">
                          {rule.recommendation}
                        </p>
                        <span className="justify-self-end rounded-full border border-[#3A3A3A] px-2 py-1 text-[11px] font-bold text-gray-400">
                          {rule.confidence}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-[#303030] bg-[#202020] p-4 text-sm leading-6 text-gray-400">
                    This review map does not have structured rules yet.
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-[#303030] bg-[#1B1B1B] p-5">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  Source body
                </p>
                <MarkdownPreview markdown={selectedReviewMap.bodyMarkdown} />
              </section>
            </main>

            <aside className="min-h-0 overflow-y-auto border-l border-[#303030] bg-[#1B1B1B] px-5 py-6">
              <section className="mb-6">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-100">
                  <BookOpen size={16} className="text-gray-500" />
                  Linked algorithms
                </h3>
                <div className="space-y-2">
                  {(details.linkedAlgorithms.length ? details.linkedAlgorithms : ['No linked algorithms']).map(
                    (algorithm) => (
                      <div
                        className="rounded-md border border-[#303030] bg-[#202020] px-3 py-2 text-sm font-semibold text-gray-200"
                        key={algorithm}
                      >
                        {algorithm}
                      </div>
                    ),
                  )}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-bold text-gray-100">Common traps</h3>
                <div className="space-y-2">
                  {(details.commonTraps.length ? details.commonTraps : ['No traps recorded yet']).map((trap) => (
                    <p
                      className="rounded-md border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-400"
                      key={trap}
                    >
                      {trap}
                    </p>
                  ))}
                </div>
              </section>

              <section className="mb-6">
                <h3 className="mb-3 text-sm font-bold text-gray-100">Related algorithm notes</h3>
                <div className="space-y-2">
                  {(relatedAlgorithms.length ? relatedAlgorithms : []).map((note) => (
                    <article className="rounded-md border border-[#303030] bg-[#202020] p-3" key={note.id}>
                      <p className="text-[13px] font-bold text-gray-100">{note.title}</p>
                      <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-gray-400">
                        {note.bodyMarkdown}
                      </p>
                    </article>
                  ))}
                  {!relatedAlgorithms.length ? (
                    <p className="rounded-md border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No algorithm note has been approved for this map yet.
                    </p>
                  ) : null}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-bold text-gray-100">Raw evidence</h3>
                <div className="space-y-2">
                  {(relatedRawNotes.length ? relatedRawNotes : []).map((note) => (
                    <article className="rounded-md border border-[#303030] bg-[#202020] p-3" key={note.id}>
                      <p className="line-clamp-1 text-[13px] font-bold text-gray-100">
                        {note.title ?? 'Untitled raw note'}
                      </p>
                      <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-gray-400">
                        {note.bodyMarkdown}
                      </p>
                    </article>
                  ))}
                  {!relatedRawNotes.length ? (
                    <p className="rounded-md border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No raw notes match this map yet.
                    </p>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center bg-[#202020] px-8">
            <div className="max-w-[460px] rounded-lg border border-[#303030] bg-[#1B1B1B] p-6 text-center">
              <Library className="mx-auto mb-4 text-gray-500" size={36} />
              <h3 className="text-lg font-bold text-white">No review maps yet</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                When the compiler detects a decision guide and you approve it, it will appear here.
              </p>
            </div>
          </div>
        )}
      </div>
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedTheme = window.localStorage.getItem('knowledgeCompilerTheme')
    return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light'
  })
  const [title, setTitle] = useState('')
  const [bodyMarkdown, setBodyMarkdown] = useState('')
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(emptyWorkspaceData)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [selectedRawNoteId, setSelectedRawNoteId] = useState<string | null>(null)
  const [isRawNoteDirty, setIsRawNoteDirty] = useState(false)
  const [selectedReviewMapId, setSelectedReviewMapId] = useState<string | null>(null)
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
    window.localStorage.setItem('knowledgeCompilerTheme', themeMode)
  }, [themeMode])

  useEffect(() => {
    if (activeView === 'raw_note_editor') {
      titleInputRef.current?.focus()
    }
  }, [activeView])

  useEffect(() => {
    if (!selectedReviewMapId && workspaceData.reviewMaps.length > 0) {
      setSelectedReviewMapId(workspaceData.reviewMaps[0].id)
      return
    }

    if (
      selectedReviewMapId &&
      workspaceData.reviewMaps.length > 0 &&
      !workspaceData.reviewMaps.some((reviewMap) => reviewMap.id === selectedReviewMapId)
    ) {
      setSelectedReviewMapId(workspaceData.reviewMaps[0].id)
    }
  }, [selectedReviewMapId, workspaceData.reviewMaps])

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

  function openReviewMapsView() {
    setActiveView('review_maps')
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

  async function decideNoteLink(linkId: string, decision: 'approve' | 'reject') {
    try {
      await requestJson(`/note-links/${linkId}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setNotice(decision === 'approve' ? 'Note link approved.' : 'Note link rejected.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update note link')
      setNotice(null)
    }
  }

  async function createManualNoteLink(input: {
    sourceNoteId: string
    targetNoteId: string
    relationType: string
  }) {
    try {
      await requestJson('/note-links', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      setNotice('Note link added.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create note link')
      setNotice(null)
    }
  }

  async function updateManualNoteLink(linkId: string, relationType: string) {
    try {
      await requestJson(`/note-links/${linkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ relationType }),
      })
      setNotice('Note link updated.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to update note link')
      setNotice(null)
    }
  }

  async function removeManualNoteLink(linkId: string) {
    try {
      await requestJson(`/note-links/${linkId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      })
      setNotice('Note link removed.')
      setError(null)
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to remove note link')
      setNotice(null)
    }
  }

  return (
    <main
      className={`theme-${themeMode} flex h-screen min-w-[1180px] overflow-hidden bg-canvas text-ink`}
    >
      <LeftNavigation
        activeView={activeView}
        onCaptureClick={openNewRawNoteEditor}
        onKnowledgeMapClick={() => setActiveView('knowledge_map')}
        onRawNotesClick={openRawNotesView}
        onReviewMapsClick={openReviewMapsView}
        onThemeToggle={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
        pendingCount={pendingCount}
        reviewMapCount={workspaceData.reviewMaps.length}
        themeMode={themeMode}
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
              <KnowledgeCanvas
                data={workspaceData}
                onCreateNoteLink={(input) => void createManualNoteLink(input)}
                onDecideNoteLink={(linkId, decision) => void decideNoteLink(linkId, decision)}
                onRemoveNoteLink={(linkId) => void removeManualNoteLink(linkId)}
                onUpdateNoteLink={(linkId, relationType) => void updateManualNoteLink(linkId, relationType)}
              />
            </div>
          </>
        ) : activeView === 'review_maps' ? (
          <ReviewMapsPage
            compiledNotes={workspaceData.compiledNotes}
            onSelectReviewMap={setSelectedReviewMapId}
            rawNotes={workspaceData.rawNotes}
            reviewMaps={workspaceData.reviewMaps}
            selectedReviewMapId={selectedReviewMapId}
          />
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
