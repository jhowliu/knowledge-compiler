import { ArrowRight, BookOpen, Layers3, Library, Network } from 'lucide-react'
import { MarkdownPreview } from '../../components/MarkdownPreview'
import { reviewMapDetails, reviewMapSummary } from '../../lib/knowledge'
import type { CompiledNote, RawNote } from '../../types/domain'

export function ReviewMapsPage({
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
