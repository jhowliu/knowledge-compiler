import { Archive, FileText, Link2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Pill, useDialog } from '../../components/ui'
import { loadKnowledgeSourceTimeline } from '../../lib/api'
import type { KnowledgeSearchResult, KnowledgeSourceTimeline } from '../../types/domain'

function compactText(value: string, maxLength = 260) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export function KnowledgeSearchPanel({
  error,
  includeArchived,
  isLoading,
  isOpen,
  onClose,
  onIncludeArchivedChange,
  onQueryChange,
  onSubmit,
  query,
  results,
}: {
  error: string | null
  includeArchived: boolean
  isLoading: boolean
  isOpen: boolean
  onClose: () => void
  onIncludeArchivedChange: (value: boolean) => void
  onQueryChange: (value: string) => void
  onSubmit: () => void
  query: string
  results: KnowledgeSearchResult[]
}) {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<KnowledgeSourceTimeline | null>(null)
  const [timelineStatus, setTimelineStatus] = useState<'idle' | 'loading' | 'loaded' | 'missing'>(
    'idle',
  )

  const selectedResult = useMemo(() => {
    return (
      results.find((result) => result.blockId === selectedResultId) ??
      results[0] ??
      null
    )
  }, [results, selectedResultId])

  useEffect(() => {
    if (!results.some((result) => result.blockId === selectedResultId)) {
      setSelectedResultId(results[0]?.blockId ?? null)
    }
  }, [results, selectedResultId])

  useEffect(() => {
    let isCurrent = true

    if (!isOpen || !selectedResult) {
      setTimeline(null)
      setTimelineStatus('idle')
      return () => {
        isCurrent = false
      }
    }

    setTimelineStatus('loading')
    loadKnowledgeSourceTimeline(selectedResult.knowledgeSourceId)
      .then((nextTimeline) => {
        if (!isCurrent) {
          return
        }
        setTimeline(nextTimeline)
        setTimelineStatus('loaded')
      })
      .catch(() => {
        if (!isCurrent) {
          return
        }
        setTimeline(null)
        setTimelineStatus('missing')
      })

    return () => {
      isCurrent = false
    }
  }, [isOpen, selectedResult])

  useDialog(onClose, isOpen)

  if (!isOpen) {
    return null
  }

  const trimmedQuery = query.trim()

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 px-6 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        aria-label="Knowledge search"
        aria-modal="true"
        className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-300 bg-surface shadow-card"
        role="dialog"
      >
        <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <form
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-gray-300 bg-canvas px-3.5 text-[13px] text-gray-500 focus-within:border-violet focus-within:bg-surface focus-within:ring-2 focus-within:ring-violet/20"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <Search aria-hidden size={16} />
            <input
              aria-label="Search approved knowledge"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-gray-500"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search approved knowledge..."
              type="search"
              value={query}
            />
          </form>
          <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-300 bg-surface px-3 text-xs font-bold text-gray-600">
            <input
              checked={includeArchived}
              className="h-4 w-4 accent-violet"
              onChange={(event) => onIncludeArchivedChange(event.target.checked)}
              type="checkbox"
            />
            Archived
          </label>
          <button
            aria-label="Close search"
            className="grid h-11 w-11 place-items-center rounded-lg border border-gray-300 bg-surface text-gray-600 hover:bg-gray-50"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-h-0 overflow-y-auto bg-canvas p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-ink">
                {trimmedQuery
                  ? `${results.length} result${results.length === 1 ? '' : 's'}`
                  : 'Search compiled knowledge'}
              </h2>
              {isLoading ? (
                <Pill className="bg-surface" tone="neutral">
                  Searching…
                </Pill>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
                {error}
              </div>
            ) : !trimmedQuery ? (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-gray-300 bg-surface p-8 text-center">
                <div>
                  <Search aria-hidden className="mx-auto mb-3 text-accent" size={34} />
                  <p className="text-lg font-bold text-ink">Find a knowledge block</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                    Search reads approved knowledge blocks first. Raw notes and uploaded sources
                    stay attached as evidence.
                  </p>
                </div>
              </div>
            ) : !isLoading && results.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-gray-300 bg-surface p-8 text-center">
                <div>
                  <FileText aria-hidden className="mx-auto mb-3 text-gray-500" size={34} />
                  <p className="text-lg font-bold text-ink">No matching knowledge yet</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                    Try a different term or include archived versions.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result) => (
                  <button
                    className={`w-full rounded-lg border bg-surface p-4 text-left shadow-sm ${
                      selectedResult?.blockId === result.blockId
                        ? 'border-violet ring-2 ring-violet/15'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    key={result.blockId}
                    onClick={() => setSelectedResultId(result.blockId)}
                    type="button"
                  >
                    <h3 className="text-[17px] font-bold leading-6 text-ink">{result.title}</h3>
                    <p className="mt-0.5 text-xs font-medium text-gray-500">
                      {result.domain} · {result.knowledgeType} · v{result.versionNumber}
                    </p>
                    {result.heading ? (
                      <p className="mt-2 text-sm font-semibold text-gray-700">{result.heading}</p>
                    ) : null}
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {compactText(result.bodyMarkdown)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Pill>Block {result.blockIndex + 1}</Pill>
                      <Pill>Updated {formatDate(result.updatedAt)}</Pill>
                      {result.status !== 'active' ? (
                        <Pill className="capitalize">
                          <Archive aria-hidden size={12} />
                          {result.status}
                        </Pill>
                      ) : null}
                      <Pill>
                        <Link2 aria-hidden size={12} />
                        {result.evidenceReferences.length} evidence
                      </Pill>
                    </div>
                    {result.evidenceReferences.length > 0 ? (
                      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                        {result.evidenceReferences.slice(0, 2).map((evidence) => (
                          <div
                            className="rounded-md border border-gray-200 bg-canvas px-3 py-2"
                            key={evidence.id}
                          >
                            <p className="text-xs font-bold text-ink">
                              {evidence.rawSourceTitle ?? evidence.sourceTitle ?? 'Evidence'}
                            </p>
                            {evidence.chunkBodyMarkdown ? (
                              <p className="mt-1 text-xs leading-5 text-gray-500">
                                {compactText(evidence.chunkBodyMarkdown, 160)}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-surface p-5">
            {selectedResult ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold leading-6 text-ink">
                    {selectedResult.title}
                  </h3>
                  {selectedResult.heading ? (
                    <p className="mt-2 text-sm font-semibold text-gray-700">
                      {selectedResult.heading}
                    </p>
                  ) : null}
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                    {selectedResult.bodyMarkdown}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-gray-200 bg-canvas p-3">
                    <p className="font-bold text-gray-500">Version</p>
                    <p className="mt-1 font-bold text-ink">v{selectedResult.versionNumber}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-canvas p-3">
                    <p className="font-bold text-gray-500">Status</p>
                    <p className="mt-1 font-bold text-ink">{selectedResult.status}</p>
                  </div>
                </div>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-ink">Evidence</p>
                    <span className="text-xs font-bold text-gray-500">
                      {selectedResult.evidenceReferences.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedResult.evidenceReferences.length > 0 ? (
                      selectedResult.evidenceReferences.map((evidence) => (
                        <div
                          className="rounded-lg border border-gray-200 bg-canvas p-3"
                          key={evidence.id}
                        >
                          <p className="text-xs font-bold text-ink">
                            {evidence.rawSourceTitle ?? evidence.sourceTitle ?? 'Evidence'}
                          </p>
                          {evidence.chunkHeading ? (
                            <p className="mt-1 text-xs font-semibold text-gray-600">
                              {evidence.chunkHeading}
                            </p>
                          ) : null}
                          {evidence.chunkBodyMarkdown ? (
                            <p className="mt-2 text-xs leading-5 text-gray-500">
                              {compactText(evidence.chunkBodyMarkdown, 220)}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-dashed border-gray-300 p-3 text-sm leading-6 text-gray-500">
                        No evidence links attached to this block yet.
                      </p>
                    )}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-ink">Evolution</p>
                    <span className="text-xs font-bold text-gray-500">
                      {timelineStatus === 'loading'
                        ? 'Loading'
                        : timeline
                          ? `${timeline.versions.length} versions`
                          : 'No timeline'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {timeline?.versions.map((version) => (
                      <div
                        className="rounded-lg border border-gray-200 bg-canvas p-3"
                        key={version.id}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-bold text-ink">v{version.versionNumber}</p>
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-gray-500">
                            {version.state}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          {formatDate(version.createdAt)}
                        </p>
                        {version.changeSummary ? (
                          <p className="mt-2 text-xs leading-5 text-gray-600">
                            {version.changeSummary}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    {timelineStatus === 'missing' ? (
                      <p className="rounded-lg border border-dashed border-gray-300 p-3 text-sm leading-6 text-gray-500">
                        Timeline is not available for this result.
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-ink">Retrieval corpus</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
                  <p>Search targets approved knowledge blocks.</p>
                  <p>Evidence links show the raw notes, papers, or chunks that shaped each block.</p>
                  <p>Archived versions stay hidden unless the archive toggle is enabled.</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  )
}
