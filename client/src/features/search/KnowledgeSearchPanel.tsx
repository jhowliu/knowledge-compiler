import { Archive, FileText, Link2, Search, X } from 'lucide-react'
import type { KnowledgeSearchResult } from '../../types/domain'

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

function scoreLabel(rank: number) {
  if (!Number.isFinite(rank)) {
    return 'match'
  }

  return rank > 0 ? rank.toFixed(2) : 'match'
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
  if (!isOpen) {
    return null
  }

  const trimmedQuery = query.trim()

  return (
    <div className="fixed inset-0 z-40 bg-ink/30 px-6 py-8">
      <section className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-card">
        <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <form
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-gray-300 bg-canvas px-3.5 text-[13px] text-gray-500 focus-within:border-violet focus-within:bg-white"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <Search size={16} />
            <input
              aria-label="Search approved knowledge"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-gray-500"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search approved knowledge..."
              type="search"
              value={query}
            />
          </form>
          <label className="flex h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-gray-600">
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
            className="grid h-11 w-11 place-items-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_270px]">
          <div className="min-h-0 overflow-y-auto bg-canvas p-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet">
                  Knowledge Search
                </p>
                <h2 className="mt-1 text-xl font-bold text-ink">
                  {trimmedQuery
                    ? `${results.length} result${results.length === 1 ? '' : 's'}`
                    : 'Search compiled knowledge'}
                </h2>
              </div>
              {isLoading ? (
                <span className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-500">
                  Searching
                </span>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {error}
              </div>
            ) : !trimmedQuery ? (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
                <div>
                  <Search className="mx-auto mb-3 text-violet" size={34} />
                  <p className="text-lg font-bold text-ink">Find a knowledge block</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                    Search reads approved knowledge blocks first. Raw notes and uploaded sources
                    stay attached as evidence.
                  </p>
                </div>
              </div>
            ) : !isLoading && results.length === 0 ? (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
                <div>
                  <FileText className="mx-auto mb-3 text-gray-400" size={34} />
                  <p className="text-lg font-bold text-ink">No matching knowledge yet</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                    Try a different term or include archived versions.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result) => (
                  <article
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                    key={result.blockId}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {result.domain} / {result.knowledgeType} / v{result.versionNumber}
                        </p>
                        <h3 className="mt-1 text-[17px] font-bold leading-6 text-ink">
                          {result.title}
                        </h3>
                        {result.heading ? (
                          <p className="mt-1 text-sm font-semibold text-gray-700">
                            {result.heading}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-full border border-gray-200 bg-canvas px-2.5 py-1 text-[11px] font-bold text-gray-500">
                        {scoreLabel(result.rank)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
                      {compactText(result.bodyMarkdown)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-bold text-gray-500">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">
                        Block {result.blockIndex + 1}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">
                        Updated {formatDate(result.updatedAt)}
                      </span>
                      {result.status !== 'active' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                          <Archive size={12} />
                          {result.status}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                        <Link2 size={12} />
                        {result.evidenceReferences.length} evidence
                      </span>
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
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="border-l border-gray-200 bg-white p-5">
            <p className="text-sm font-bold text-ink">Retrieval corpus</p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
              <p>Search targets approved knowledge blocks.</p>
              <p>Evidence links show the raw notes, papers, or chunks that shaped each block.</p>
              <p>Archived versions stay hidden unless the archive toggle is enabled.</p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
