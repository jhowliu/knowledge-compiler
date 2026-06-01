import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  GitBranch,
  History,
  Link2,
  Maximize2,
  Plus,
  RotateCw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { MarkdownPreview } from '../../components/MarkdownPreview'
import { loadKnowledgeTimelineForCompiledNote } from '../../lib/api'
import { maxCanvasZoom, minCanvasZoom, relationOptions } from '../../lib/constants'
import type {
  CompiledNote,
  KnowledgeSourceTimeline,
  NoteLink,
  RelatedNoteMatch,
  WorkspaceData,
} from '../../types/domain'
import { agentRunLabel, relationLabel, relationOptionLabel, shortTimestamp } from '../agent-runs/agentRunView'

function noteTypeLabel(noteType: string) {
  return noteType.replaceAll('_', ' ')
}

function noteTone(noteType: string) {
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
  return [...notes.values()]
}

function connectedNoteId(link: NoteLink, noteId: string) {
  if (link.sourceNoteId === noteId) return link.targetNoteId
  if (link.targetNoteId === noteId) return link.sourceNoteId
  return null
}

function edgePath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x
  const bend = Math.max(8, Math.min(22, Math.abs(dx) * 0.45))
  const direction = dx >= 0 ? 1 : -1
  const c1x = start.x + bend * direction
  const c2x = end.x - bend * direction
  return `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function uniqueRelatedMatches(matches: RelatedNoteMatch[]) {
  const seen = new Set<string>()
  return matches.filter((match) => {
    if (seen.has(match.note.id)) {
      return false
    }
    seen.add(match.note.id)
    return true
  })
}

export function KnowledgeCanvas({
  data,
  onCreateNoteLink,
  onDecideNoteLink,
  onMoveNoteCard,
  onResetBoardLayout,
  onRemoveNoteLink,
  onSelectAgentRun,
  onUpdateNoteLink,
}: {
  data: WorkspaceData
  onCreateNoteLink: (input: { sourceNoteId: string; targetNoteId: string; relationType: string }) => void
  onDecideNoteLink: (linkId: string, decision: 'approve' | 'reject') => void
  onMoveNoteCard: (noteId: string, position: { x: number; y: number }) => void
  onResetBoardLayout: () => void
  onRemoveNoteLink: (linkId: string) => void
  onSelectAgentRun: (agentRunId: string) => void
  onUpdateNoteLink: (linkId: string, relationType: string) => void
}) {
  const canvasRef = useRef<HTMLElement | null>(null)
  const latestNodePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const notes = useMemo(() => mergeKnowledgeNotes(data), [data.compiledNotes])
  const noteById = useMemo(() => new globalThis.Map(notes.map((note) => [note.id, note])), [notes])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkTargetId, setLinkTargetId] = useState('')
  const [manualRelationType, setManualRelationType] = useState<(typeof relationOptions)[number][0]>(
    'related_concept',
  )
  const [canvasZoom, setCanvasZoom] = useState(1)
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 })
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [knowledgeTimeline, setKnowledgeTimeline] = useState<KnowledgeSourceTimeline | null>(null)
  const [timelineStatus, setTimelineStatus] = useState<'idle' | 'loading' | 'loaded' | 'missing'>('idle')
  const [panState, setPanState] = useState<{
    startClientX: number
    startClientY: number
    origin: { x: number; y: number }
  } | null>(null)
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
  const persistedNodePositions = useMemo(() => {
    return Object.fromEntries(
      data.noteCardPositions.map((position) => [
        position.noteId,
        { x: position.x, y: position.y },
      ]),
    ) as Record<string, { x: number; y: number }>
  }, [data.noteCardPositions])

  useEffect(() => {
    latestNodePositionsRef.current = persistedNodePositions
    setNodePositions(persistedNodePositions)
  }, [persistedNodePositions])
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null

  useEffect(() => {
    let cancelled = false
    if (!selectedNote?.id) {
      setKnowledgeTimeline(null)
      setTimelineStatus('idle')
      return
    }

    setTimelineStatus('loading')
    loadKnowledgeTimelineForCompiledNote(selectedNote.id)
      .then((timeline) => {
        if (!cancelled) {
          setKnowledgeTimeline(timeline)
          setTimelineStatus('loaded')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKnowledgeTimeline(null)
          setTimelineStatus('missing')
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedNote?.id])

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
      const keywordMatches = selectedKeywords.filter((keyword) => noteText.includes(keyword)).length
      return {
        note,
        score: (titleMatch ? 4 : 0) + keywordMatches,
        reason: titleMatch
          ? 'Backlink by title mention'
          : keywordMatches > 1
            ? 'Shares indexed concepts'
            : 'Nearby compiled note',
      }
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
  const relatedNotes = uniqueRelatedMatches([...approvedLinkedNotes, ...inferredRelatedNotes]).slice(0, 5)
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
      x: ((event.clientX - rect.left - canvasPan.x) / (rect.width * canvasZoom)) * 100,
      y: ((event.clientY - rect.top - canvasPan.y) / (rect.height * canvasZoom)) * 100,
    }
  }

  function zoomCanvas(nextZoom: number, anchor?: { x: number; y: number }) {
    const clampedZoom = clampNumber(nextZoom, minCanvasZoom, maxCanvasZoom)
    if (!anchor || !canvasRef.current) {
      setCanvasZoom(clampedZoom)
      return
    }

    const rect = canvasRef.current.getBoundingClientRect()
    const anchorX = anchor.x - rect.left
    const anchorY = anchor.y - rect.top
    const worldX = (anchorX - canvasPan.x) / canvasZoom
    const worldY = (anchorY - canvasPan.y) / canvasZoom

    setCanvasZoom(clampedZoom)
    setCanvasPan({
      x: anchorX - worldX * clampedZoom,
      y: anchorY - worldY * clampedZoom,
    })
  }

  function resetCanvasView() {
    setCanvasZoom(1)
    setCanvasPan({ x: 0, y: 0 })
  }

  function resetCurrentBoardLayout() {
    resetCanvasView()
    latestNodePositionsRef.current = {}
    setNodePositions({})
    onResetBoardLayout()
  }

  function startPan(event: React.PointerEvent) {
    const target = event.target as HTMLElement
    if (target.closest('[data-note-id], button, input, select, textarea')) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanState({
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: canvasPan,
    })
  }

  function wheelCanvas(event: React.WheelEvent) {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -1 : 1
    zoomCanvas(canvasZoom + direction * 0.08, { x: event.clientX, y: event.clientY })
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

    if (panState) {
      setCanvasPan({
        x: panState.origin.x + event.clientX - panState.startClientX,
        y: panState.origin.y + event.clientY - panState.startClientY,
      })
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
      x: Math.min(86, Math.max(14, dragState.origin.x + ((event.clientX - dragState.startClientX) / (rect.width * canvasZoom)) * 100)),
      y: Math.min(86, Math.max(16, dragState.origin.y + ((event.clientY - dragState.startClientY) / (rect.height * canvasZoom)) * 100)),
    }
    setNodePositions((positions) => {
      const nextPositions = { ...positions, [dragState.noteId]: nextPosition }
      latestNodePositionsRef.current = nextPositions
      return nextPositions
    })
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
    } else if (dragState) {
      const position = latestNodePositionsRef.current[dragState.noteId]
      if (position) {
        onMoveNoteCard(dragState.noteId, position)
      }
    }
    setConnectState(null)
    setDragState(null)
    setPanState(null)
  }

  return (
    <section className="flex min-h-0 flex-1 bg-canvas">
      <main
        className={`relative min-h-0 flex-1 overflow-hidden ${panState ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={startPan}
        onPointerMove={movePointer}
        onPointerUp={finishPointer}
        onWheel={wheelCanvas}
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

        <div className="absolute right-7 top-6 z-20 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-ink"
            onClick={() => zoomCanvas(canvasZoom - 0.12)}
            title="Zoom out"
            type="button"
          >
            <ZoomOut size={16} />
          </button>
          <span className="min-w-12 text-center text-xs font-extrabold text-ink">
            {Math.round(canvasZoom * 100)}%
          </span>
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-ink"
            onClick={() => zoomCanvas(canvasZoom + 0.12)}
            title="Zoom in"
            type="button"
          >
            <ZoomIn size={16} />
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-ink"
            onClick={resetCanvasView}
            title="Reset view"
            type="button"
          >
            <Maximize2 size={15} />
          </button>
        </div>

        <button
          className="absolute right-7 top-[78px] z-20 h-8 rounded-md border border-gray-200 bg-white px-3 text-xs font-extrabold text-gray-600 shadow-sm hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          onClick={resetCurrentBoardLayout}
          type="button"
        >
          Reset layout
        </button>

        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
            transformOrigin: '0 0',
          }}
        >
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
                        stroke={node.link ? 'rgba(79, 70, 229, 0.78)' : 'rgba(100, 116, 139, 0.56)'}
                        strokeDasharray={node.link ? undefined : '2.5 3.5'}
                        strokeLinecap="round"
                        strokeWidth={node.link ? '0.9' : '0.55'}
                        vectorEffect="non-scaling-stroke"
                      />
                      {node.link ? (
                        <text
                          dominantBaseline="middle"
                          fill="rgba(67, 56, 202, 0.96)"
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
                  stroke="rgba(124, 58, 237, 0.95)"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                  strokeWidth="1"
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
                  className={`absolute z-10 w-[208px] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-lg border bg-white p-3 text-left shadow-card transition hover:-translate-y-[calc(50%+2px)] ${
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
        </div>

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
                  <History size={15} className="text-violet" />
                  Evolution
                </h3>
                {timelineStatus === 'loading' ? (
                  <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                    Loading knowledge history...
                  </p>
                ) : knowledgeTimeline ? (
                  <div className="space-y-2">
                    {knowledgeTimeline.versions.slice(0, 4).map((version) => (
                      <article className="rounded-lg border border-[#303030] bg-[#202020] p-3" key={version.id}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-extrabold text-white">
                              Version {version.versionNumber}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                              {shortTimestamp(version.createdAt)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                              version.isCurrent
                                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                                : 'border-[#3A3A3A] text-gray-400'
                            }`}
                          >
                            {version.state}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs leading-5 text-gray-400">
                          {version.changeSummary ?? `Proposal ${version.proposalId ?? 'unknown'} updated this note.`}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-md border border-[#303030] bg-[#171717] px-2 py-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Blocks</p>
                            <p className="mt-0.5 text-sm font-extrabold text-white">{version.blocks.length}</p>
                          </div>
                          <div className="rounded-md border border-[#303030] bg-[#171717] px-2 py-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Evidence</p>
                            <p className="mt-0.5 text-sm font-extrabold text-white">
                              {version.evidenceReferences.length}
                            </p>
                          </div>
                        </div>
                        {version.evidenceReferences.length ? (
                          <div className="mt-3 space-y-1.5">
                            {version.evidenceReferences.slice(0, 2).map((evidence) => (
                              <p
                                className="line-clamp-2 rounded-md border border-[#303030] bg-[#171717] px-2 py-1.5 text-[11px] leading-4 text-gray-400"
                                key={evidence.id}
                              >
                                {evidence.chunkHeading ??
                                  evidence.sourceTitle ??
                                  evidence.rawSourceTitle ??
                                  evidence.sourceType.replaceAll('_', ' ')}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                    No version history has been linked to this card yet.
                  </p>
                )}
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
                  <RotateCw size={15} className="text-violet" />
                  Agent activity
                </h3>
                <div className="mb-6 space-y-2">
                  {data.agentRuns.length ? (
                    data.agentRuns.slice(0, 3).map((agentRun) => (
                      <button
                        className="w-full rounded-lg border border-[#303030] bg-[#202020] p-3 text-left hover:border-violet/50"
                        key={agentRun.id}
                        onClick={() => onSelectAgentRun(agentRun.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[13px] font-extrabold capitalize text-white">
                              {agentRunLabel(agentRun.runType)}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-gray-400">
                              {agentRun.error ?? 'Background run tracked with proposal-safe writes.'}
                            </p>
                          </div>
                          <span className="rounded-full border border-[#3A3A3A] px-2 py-0.5 text-[10px] font-bold uppercase text-gray-300">
                            {agentRun.status}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-lg border border-[#303030] bg-[#202020] p-3 text-xs leading-5 text-gray-500">
                      No agent runs yet. Start with Re-index links.
                    </p>
                  )}
                </div>

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
