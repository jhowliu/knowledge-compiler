import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  GitBranch,
  History,
  Link2,
  Maximize2,
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
import { relationOptionLabel, shortTimestamp } from '../agent-runs/agentRunView'

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

function edgePath(start: { x: number; y: number }, end: { x: number; y: number }, laneOffset = 0) {
  const dx = end.x - start.x
  const bend = Math.max(8, Math.min(22, Math.abs(dx) * 0.45))
  const direction = dx >= 0 ? 1 : -1
  const c1x = start.x + bend * direction
  const c2x = end.x - bend * direction
  return `M ${start.x} ${start.y} C ${c1x} ${start.y + laneOffset}, ${c2x} ${end.y + laneOffset}, ${end.x} ${end.y}`
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

function uniqueNotes(notes: CompiledNote[]) {
  const seen = new Set<string>()
  return notes.filter((note) => {
    if (seen.has(note.id)) {
      return false
    }
    seen.add(note.id)
    return true
  })
}

function confidenceLabel(confidence: string) {
  return confidence ? `${confidence} confidence` : 'confidence unknown'
}

export function KnowledgeCanvas({
  data,
  onCreateNoteLink,
  onDecideNoteLink,
  onMoveNoteCard,
  onResetBoardLayout,
  onRemoveNoteLink,
  onUpdateNoteLink,
}: {
  data: WorkspaceData
  onCreateNoteLink: (input: { sourceNoteId: string; targetNoteId: string; relationType: string }) => void
  onDecideNoteLink: (linkId: string, decision: 'approve' | 'reject') => void
  onMoveNoteCard: (noteId: string, position: { x: number; y: number }) => void
  onResetBoardLayout: () => void
  onRemoveNoteLink: (linkId: string) => void
  onUpdateNoteLink: (linkId: string, relationType: string) => void
}) {
  const canvasRef = useRef<HTMLElement | null>(null)
  const latestNodePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const notes = useMemo(() => mergeKnowledgeNotes(data), [data.compiledNotes])
  const noteById = useMemo(() => new globalThis.Map(notes.map((note) => [note.id, note])), [notes])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedNoteModalId, setSelectedNoteModalId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
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
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNoteId: string
    targetNoteId: string
    midpoint: { x: number; y: number }
    relationType: string
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
  const selectedModalNote = selectedNoteModalId ? noteById.get(selectedNoteModalId) ?? null : null

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
            reason: relationOptionLabel(link.relationType),
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
            ? 'Concept overlap'
            : 'Nearby compiled note',
      }
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
  const relatedNotes = uniqueRelatedMatches([...approvedLinkedNotes, ...inferredRelatedNotes]).slice(0, 5)
  const linkVisibleStatuses = new Set(['approved', 'pending'])
  const connectedGraphNotes = selectedNoteLinks
    .filter((link) => linkVisibleStatuses.has(link.status))
    .map((link) => (selectedNote ? noteById.get(connectedNoteId(link, selectedNote.id) ?? '') : null))
    .filter((note): note is CompiledNote => Boolean(note))
  const visibleGraphNotes = uniqueNotes([
    ...(selectedNote ? [selectedNote] : []),
    ...connectedGraphNotes,
    ...notes,
  ]).slice(0, 9)
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
  const graphNodeById = new globalThis.Map(graphNodes.map((node) => [node.note.id, node]))
  const baseGraphEdges = data.noteLinks
    .filter(
      (link) =>
        link.sourceNoteType === 'compiled_note' &&
        link.targetNoteType === 'compiled_note' &&
        linkVisibleStatuses.has(link.status),
    )
    .map((link) => {
      const sourceNode = graphNodeById.get(link.sourceNoteId)
      const targetNode = graphNodeById.get(link.targetNoteId)
      if (!sourceNode || !targetNode) return null
      return {
        id: link.id,
        link,
        sourceNode,
        targetNode,
        midpoint: {
          x: (sourceNode.position.x + targetNode.position.x) / 2,
          y: (sourceNode.position.y + targetNode.position.y) / 2,
        },
      }
    })
    .filter(
      (
        edge,
      ): edge is {
        id: string
        link: NoteLink
        sourceNode: (typeof graphNodes)[number]
        targetNode: (typeof graphNodes)[number]
        midpoint: { x: number; y: number }
      } => Boolean(edge),
    )
  const edgeVisualGroups = new globalThis.Map<string, typeof baseGraphEdges>()
  for (const edge of baseGraphEdges) {
    const [leftId, rightId] = [edge.link.sourceNoteId, edge.link.targetNoteId].sort()
    const key = `${leftId}:${rightId}`
    edgeVisualGroups.set(key, [...(edgeVisualGroups.get(key) ?? []), edge])
  }
  const graphEdges = baseGraphEdges.map((edge) => {
    const [leftId, rightId] = [edge.link.sourceNoteId, edge.link.targetNoteId].sort()
    const visualGroup = edgeVisualGroups.get(`${leftId}:${rightId}`) ?? [edge]
    const laneIndex = visualGroup.findIndex((item) => item.id === edge.id)
    const laneOffset = (laneIndex - (visualGroup.length - 1) / 2) * 4.6
    return {
      ...edge,
      laneOffset,
      midpoint: {
        x: edge.midpoint.x,
        y: edge.midpoint.y + laneOffset,
      },
    }
  })
  const selectedEdge = graphEdges.find((edge) => edge.id === selectedEdgeId) ?? null
  const duplicateRelationTypesForSelectedEdge = new Set(
    selectedEdge
      ? graphEdges
          .filter(
            (edge) =>
              edge.id !== selectedEdge.id &&
              edge.link.sourceNoteType === selectedEdge.link.sourceNoteType &&
              edge.link.sourceNoteId === selectedEdge.link.sourceNoteId &&
              edge.link.targetNoteType === selectedEdge.link.targetNoteType &&
              edge.link.targetNoteId === selectedEdge.link.targetNoteId,
          )
          .map((edge) => edge.link.relationType)
      : [],
  )
  const pendingConnectionRelationOptions = pendingConnection
    ? relationOptions.filter(([value]) => !relationTypesForPair(pendingConnection.sourceNoteId, pendingConnection.targetNoteId).has(value))
    : []
  const evidenceSummaryCount =
    knowledgeTimeline?.sourceEvidenceReferences.length ??
    knowledgeTimeline?.versions.find((version) => version.isCurrent)?.evidenceReferences.length ??
    0
  const approvedConnectionCount = selectedNoteLinks.filter((link) => link.status === 'approved').length

  useEffect(() => {
    if (selectedEdgeId && !graphEdges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null)
    }
  }, [graphEdges, selectedEdgeId])

  useEffect(() => {
    if (selectedNoteModalId && !noteById.has(selectedNoteModalId)) {
      setSelectedNoteModalId(null)
    }
  }, [noteById, selectedNoteModalId])

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

  function relationTypesForPair(sourceNoteId: string, targetNoteId: string) {
    return new Set(
      data.noteLinks
        .filter(
          (link) =>
            linkVisibleStatuses.has(link.status) &&
            link.sourceNoteType === 'compiled_note' &&
            link.targetNoteType === 'compiled_note' &&
            link.sourceNoteId === sourceNoteId &&
            link.targetNoteId === targetNoteId,
        )
        .map((link) => link.relationType),
    )
  }

  function preferredRelationTypeForPair(sourceNoteId: string, targetNoteId: string) {
    const usedRelationTypes = relationTypesForPair(sourceNoteId, targetNoteId)
    const availableOptions = relationOptions.filter(([value]) => !usedRelationTypes.has(value))
    return availableOptions.find(([value]) => value === 'related_concept')?.[0] ?? availableOptions[0]?.[0] ?? ''
  }

  function startPan(event: React.PointerEvent) {
    const target = event.target as HTMLElement
    if (target.closest('[data-note-id], [data-edge-toolbar], [data-link-draft], button, input, select, textarea')) {
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
        const sourceNode = graphNodeById.get(connectState.sourceNoteId)
        const targetNode = graphNodeById.get(targetNoteId)
        const midpoint =
          sourceNode && targetNode
            ? {
                x: (sourceNode.position.x + targetNode.position.x) / 2,
                y: (sourceNode.position.y + targetNode.position.y) / 2,
              }
            : connectState.current
        setPendingConnection({
          sourceNoteId: connectState.sourceNoteId,
          targetNoteId,
          midpoint,
          relationType: preferredRelationTypeForPair(connectState.sourceNoteId, targetNoteId),
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
          {graphNodes.length ? (
            <svg
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
              preserveAspectRatio="none"
              style={{ pointerEvents: 'none' }}
              viewBox="0 0 100 100"
            >
              {graphEdges.map((edge) => {
                  const isPending = edge.link.status === 'pending'
                  const isSelected = edge.id === selectedEdgeId
                  return (
                    <g key={edge.id}>
                      <path
                        d={edgePath(edge.sourceNode.position, edge.targetNode.position, edge.laneOffset)}
                        fill="none"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedEdgeId(edge.id)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setSelectedEdgeId(edge.id)
                          }
                        }}
                        role="button"
                        stroke="transparent"
                        strokeLinecap="round"
                        strokeWidth="4"
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                        tabIndex={0}
                        vectorEffect="non-scaling-stroke"
                      />
                      <path
                        d={edgePath(edge.sourceNode.position, edge.targetNode.position, edge.laneOffset)}
                        fill="none"
                        pointerEvents="none"
                        stroke={
                          isSelected
                            ? 'rgba(79, 70, 229, 0.98)'
                            : isPending
                              ? 'rgba(147, 51, 234, 0.7)'
                              : 'rgba(37, 99, 235, 0.86)'
                        }
                        strokeDasharray={isPending ? '4 3' : undefined}
                        strokeLinecap="round"
                        strokeWidth={isSelected ? '1.35' : isPending ? '0.85' : '1'}
                        vectorEffect="non-scaling-stroke"
                      />
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

          {graphEdges.map((edge) => {
            const isPending = edge.link.status === 'pending'
            const isSelected = edge.id === selectedEdgeId
            return (
              <button
                className={`pointer-events-auto absolute z-[5] rounded-full border px-2.5 py-1 text-xs font-extrabold shadow-sm transition hover:-translate-y-px hover:shadow-md ${
                  isPending
                    ? 'border-violet/20 bg-white/90 text-violet'
                    : 'border-blue-200 bg-white/90 text-blue-700'
                } ${isSelected ? 'ring-4 ring-violet/10' : ''}`}
                data-edge-label="true"
                key={`${edge.id}-label`}
                onClick={(event) => {
                  event.stopPropagation()
                  setSelectedEdgeId(edge.id)
                  setPendingConnection(null)
                }}
                onPointerDown={(event) => event.stopPropagation()}
                style={{
                  left: `${edge.midpoint.x}%`,
                  top: `${edge.midpoint.y}%`,
                  transform: `translate(-50%, -50%) scale(${1 / canvasZoom})`,
                }}
                type="button"
              >
                {relationOptionLabel(edge.link.relationType)}
              </button>
            )
          })}

          {selectedEdge ? (
            <div
              className="absolute z-30 w-[224px] max-w-[calc(100%-24px)] rounded-lg border border-gray-200 bg-white p-2 text-left shadow-xl"
              data-edge-toolbar="true"
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                left: `${selectedEdge.midpoint.x}%`,
                top: `${selectedEdge.midpoint.y}%`,
                transform: `translate(-50%, calc(-100% - 20px)) scale(${1 / canvasZoom})`,
                transformOrigin: 'center bottom',
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {selectedEdge.link.status === 'pending' ? 'Pending link' : 'Approved link'}
                  </p>
                  <p className="mt-1 truncate text-[13px] font-extrabold text-ink">
                    {selectedEdge.sourceNode.note.title} to {selectedEdge.targetNode.note.title}
                  </p>
                </div>
                <button
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-ink"
                  onClick={() => setSelectedEdgeId(null)}
                  title="Close"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>

              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                Relation
              </label>
              <select
                className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-ink outline-none focus:border-violet"
                onChange={(event) => onUpdateNoteLink(selectedEdge.link.id, event.target.value)}
                value={selectedEdge.link.relationType}
              >
                {relationOptions.map(([value, label]) => {
                  const isDuplicateRelation = duplicateRelationTypesForSelectedEdge.has(value)
                  return (
                    <option disabled={isDuplicateRelation} key={value} value={value}>
                      {isDuplicateRelation ? `${label} (already linked)` : label}
                    </option>
                  )
                })}
              </select>

              <p className="mt-2 truncate text-[11px] font-semibold text-gray-500">
                {confidenceLabel(selectedEdge.link.confidence)}
                {selectedEdge.link.rationale ? ` · ${selectedEdge.link.rationale}` : ''}
              </p>

              <div className="mt-2 flex flex-wrap justify-end gap-2">
                {selectedEdge.link.status === 'pending' ? (
                  <>
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-violet px-3 text-xs font-bold text-white hover:bg-violet-dark"
                      onClick={() => onDecideNoteLink(selectedEdge.link.id, 'approve')}
                      type="button"
                    >
                      <Check size={13} />
                      Approve
                    </button>
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      onClick={() => onDecideNoteLink(selectedEdge.link.id, 'reject')}
                      type="button"
                    >
                      <X size={13} />
                      Reject
                    </button>
                  </>
                ) : (
                  <button
                    className="h-8 rounded-md border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50"
                    onClick={() => onRemoveNoteLink(selectedEdge.link.id)}
                    type="button"
                  >
                    Remove link
                  </button>
                )}
              </div>
              <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-gray-200 bg-white" />
            </div>
          ) : null}

          {pendingConnection ? (
            <div
              className="absolute z-30 w-[224px] max-w-[calc(100%-24px)] rounded-lg border border-gray-200 bg-white p-2 text-left shadow-xl"
              data-link-draft="true"
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                left: `${pendingConnection.midpoint.x}%`,
                top: `${pendingConnection.midpoint.y}%`,
                transform: `translate(-50%, calc(-100% - 20px)) scale(${1 / canvasZoom})`,
                transformOrigin: 'center bottom',
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    New link
                  </p>
                  <p className="mt-1 truncate text-[13px] font-extrabold text-ink">
                    Choose relation
                  </p>
                </div>
                <button
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-ink"
                  onClick={() => setPendingConnection(null)}
                  title="Close"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>

              {pendingConnectionRelationOptions.length ? (
                <>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    Relation
                  </label>
                  <select
                    className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-ink outline-none focus:border-violet"
                    onChange={(event) =>
                      setPendingConnection({
                        ...pendingConnection,
                        relationType: event.target.value,
                      })
                    }
                    value={pendingConnection.relationType}
                  >
                    {pendingConnectionRelationOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-violet px-3 text-xs font-bold text-white hover:bg-violet-dark disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                      disabled={!pendingConnection.relationType}
                      onClick={() => {
                        if (!pendingConnection.relationType) return
                        onCreateNoteLink({
                          sourceNoteId: pendingConnection.sourceNoteId,
                          targetNoteId: pendingConnection.targetNoteId,
                          relationType: pendingConnection.relationType,
                        })
                        setPendingConnection(null)
                      }}
                      type="button"
                    >
                      <Check size={13} />
                      Create
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs font-semibold text-gray-500">All relation types are already linked.</p>
              )}
              <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-gray-200 bg-white" />
            </div>
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
                  onClick={() => {
                    setSelectedNoteId(node.note.id)
                    setSelectedNoteModalId(node.note.id)
                    setSelectedEdgeId(null)
                    setPendingConnection(null)
                  }}
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
                      setSelectedEdgeId(null)
                      setPendingConnection(null)
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
      </main>

      {selectedModalNote ? (
        <div
          aria-labelledby="note-detail-modal-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4"
          onClick={() => setSelectedNoteModalId(null)}
          role="dialog"
        >
          <section
            className="flex max-h-[82vh] w-full max-w-[680px] flex-col overflow-hidden rounded-lg border border-[#303030] bg-[#1B1B1B] text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="border-b border-[#303030] px-6 py-5">
              <span className="mb-3 inline-flex rounded-full border border-[#3A3A3A] bg-[#202020] px-2.5 py-1 text-[11px] font-bold capitalize text-gray-300">
                {noteTypeLabel(selectedModalNote.noteType)}
              </span>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold leading-7 text-white" id="note-detail-modal-title">
                    {selectedModalNote.title}
                  </h2>
                  <p className="mt-3 text-xs font-semibold text-gray-400">
                    {evidenceSummaryCount} evidence sources · {approvedConnectionCount} connected notes
                  </p>
                </div>
                <button
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-[#202020] hover:text-white"
                  onClick={() => setSelectedNoteModalId(null)}
                  title="Close"
                  type="button"
                >
                  <X size={15} />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <section className="mb-6">
                <h3 className="mb-3 text-sm font-extrabold text-gray-100">Content</h3>
                <div className="rounded-lg border border-[#303030] bg-[#202020] p-4">
                  <MarkdownPreview markdown={selectedModalNote.bodyMarkdown} />
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
                        onClick={() => {
                          setSelectedNoteId(note.id)
                          setSelectedNoteModalId(note.id)
                        }}
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

            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
