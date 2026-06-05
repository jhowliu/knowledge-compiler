import {
  AlertTriangle,
  Bot,
  FileText,
  Loader2,
  MessageSquareQuote,
  Send,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AskCitation, AskResponse, Topic } from '../../types/domain'

const notEnoughInformationAnswer =
  "I don't have enough information in the approved knowledge base to answer that."

function compactText(value: string, maxLength = 320) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized
}

function citationTitle(citation: AskCitation, index: number) {
  return citation.title.trim() || citation.sourceNoteTitle.trim() || `Citation ${index + 1}`
}

function answerParagraphs(answer: string) {
  return answer
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function AnswerText({
  answer,
  citationCount,
  onCitationSelect,
}: {
  answer: string
  citationCount: number
  onCitationSelect: (index: number) => void
}) {
  const markerPattern = /(\[(\d+)\])/g

  return (
    <div className="space-y-4">
      {answerParagraphs(answer).map((paragraph, paragraphIndex) => {
        const parts = paragraph.split(markerPattern)
        return (
          <p className="text-[15px] leading-7 text-ink" key={`${paragraph}-${paragraphIndex}`}>
            {parts.map((part, index) => {
              const marker = part.match(/^\[(\d+)\]$/)
              if (!marker) {
                if (/^\d+$/.test(part) && parts[index - 1]?.startsWith('[')) {
                  return null
                }
                return part
              }

              const citationIndex = Number(marker[1]) - 1
              const isKnownCitation = citationIndex >= 0 && citationIndex < citationCount
              return (
                <button
                  className={`mx-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-extrabold ${
                    isKnownCitation
                      ? 'border-violet/30 bg-violet/10 text-violet hover:bg-violet/15'
                      : 'border-gray-200 bg-slate-100 text-gray-500'
                  }`}
                  key={`${part}-${index}`}
                  onClick={() => {
                    if (isKnownCitation) {
                      onCitationSelect(citationIndex)
                    }
                  }}
                  type="button"
                >
                  {part}
                </button>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}

function TopicFilter({
  onChange,
  selectedTopicIds,
  topics,
}: {
  onChange: (topicIds: string[]) => void
  selectedTopicIds: string[]
  topics: Topic[]
}) {
  if (topics.length === 0) {
    return null
  }

  const selectedTopicSet = new Set(selectedTopicIds)

  function toggleTopic(topicId: string) {
    if (selectedTopicSet.has(topicId)) {
      onChange(selectedTopicIds.filter((id) => id !== topicId))
      return
    }
    onChange([...selectedTopicIds, topicId])
  }

  return (
    <div className="flex max-w-[430px] items-center gap-2 overflow-x-auto rounded-lg border border-gray-300 bg-white px-2 py-1">
      <span className="shrink-0 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
        Topics
      </span>
      {topics.map((topic) => {
        const isSelected = selectedTopicSet.has(topic.id)
        return (
          <button
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              isSelected
                ? 'border-violet bg-violet/10 text-violet'
                : 'border-gray-200 bg-canvas text-gray-600 hover:border-gray-300'
            }`}
            key={topic.id}
            onClick={() => toggleTopic(topic.id)}
            type="button"
          >
            {topic.name}
          </button>
        )
      })}
    </div>
  )
}

export function AskPanel({
  error,
  isLoading,
  isOpen,
  onClose,
  onQueryChange,
  onSubmit,
  onTopicIdsChange,
  query,
  response,
  selectedTopicIds,
  topics,
}: {
  error: string | null
  isLoading: boolean
  isOpen: boolean
  onClose: () => void
  onQueryChange: (value: string) => void
  onSubmit: () => void
  onTopicIdsChange: (topicIds: string[]) => void
  query: string
  response: AskResponse | null
  selectedTopicIds: string[]
  topics: Topic[]
}) {
  const [selectedCitationIndex, setSelectedCitationIndex] = useState(0)
  const trimmedQuery = query.trim()
  const hasNoAnswer =
    response?.answer.trim().toLowerCase() === notEnoughInformationAnswer.toLowerCase()
  const selectedCitation = useMemo(() => {
    if (!response?.citations.length) {
      return null
    }
    return response.citations[Math.min(selectedCitationIndex, response.citations.length - 1)]
  }, [response, selectedCitationIndex])

  useEffect(() => {
    setSelectedCitationIndex(0)
  }, [response])

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink/30 px-6 py-8">
      <section className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-card">
        <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <form
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-gray-300 bg-canvas px-3.5 text-[13px] text-gray-500 focus-within:border-violet focus-within:bg-white"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <Bot size={16} />
            <textarea
              aria-label="Ask approved knowledge"
              autoFocus
              className="max-h-24 min-h-[26px] min-w-0 flex-1 resize-none bg-transparent py-2 text-[13px] leading-5 text-ink outline-none placeholder:text-gray-500"
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  onSubmit()
                }
              }}
              placeholder="Ask approved knowledge..."
              rows={1}
              value={query}
            />
            <button
              aria-label="Submit question"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-violet text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!trimmedQuery || isLoading}
              type="submit"
            >
              {isLoading ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
            </button>
          </form>
          <TopicFilter
            onChange={onTopicIdsChange}
            selectedTopicIds={selectedTopicIds}
            topics={topics}
          />
          <button
            aria-label="Close Ask"
            className="grid h-11 w-11 place-items-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-h-0 overflow-y-auto bg-canvas p-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet">
                  Knowledge Ask
                </p>
                <h2 className="mt-1 text-xl font-bold text-ink">
                  {response ? 'Grounded answer' : 'Ask the approved knowledge base'}
                </h2>
              </div>
              {isLoading ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-500">
                  <Loader2 className="animate-spin" size={13} />
                  Answering
                </span>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                {error}
              </div>
            ) : !trimmedQuery && !response ? (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
                <div>
                  <Bot className="mx-auto mb-3 text-violet" size={34} />
                  <p className="text-lg font-bold text-ink">Ask from approved knowledge</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                    Answers use approved knowledge blocks and return citations when matching context
                    is found.
                  </p>
                </div>
              </div>
            ) : isLoading && !response ? (
              <div className="grid min-h-[360px] place-items-center rounded-lg border border-gray-200 bg-white p-8 text-center">
                <div>
                  <Loader2 className="mx-auto mb-3 animate-spin text-violet" size={34} />
                  <p className="text-lg font-bold text-ink">Reading matching blocks</p>
                </div>
              </div>
            ) : response ? (
              <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      Question
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-ink">
                      {trimmedQuery}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      hasNoAnswer
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {hasNoAnswer ? 'Not enough info' : `${response.citations.length} citations`}
                  </span>
                </div>

                {hasNoAnswer ? (
                  <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18} />
                    <p className="text-sm font-semibold leading-6 text-amber-900">
                      {response.answer}
                    </p>
                  </div>
                ) : (
                  <AnswerText
                    answer={response.answer}
                    citationCount={response.citations.length}
                    onCitationSelect={setSelectedCitationIndex}
                  />
                )}
              </article>
            ) : null}
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
            {response?.citations.length ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-violet">
                      Citations
                    </p>
                    <span className="text-xs font-bold text-gray-500">
                      {response.citations.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {response.citations.map((citation, index) => (
                      <button
                        className={`w-full rounded-lg border p-3 text-left ${
                          selectedCitationIndex === index
                            ? 'border-violet bg-violet/10 ring-2 ring-violet/10'
                            : 'border-gray-200 bg-canvas hover:border-gray-300'
                        }`}
                        key={`${citation.blockId}-${index}`}
                        onClick={() => setSelectedCitationIndex(index)}
                        type="button"
                      >
                        <div className="flex items-start gap-2">
                          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1 text-[11px] font-extrabold text-violet">
                            [{index + 1}]
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold leading-5 text-ink">
                              {citationTitle(citation, index)}
                            </p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">
                              {citation.sourceNoteTitle}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedCitation ? (
                  <section>
                    <div className="flex items-center gap-2">
                      <MessageSquareQuote size={15} className="text-violet" />
                      <p className="text-sm font-bold text-ink">Source snippet</p>
                    </div>
                    <div className="mt-3 rounded-lg border border-gray-200 bg-canvas p-3">
                      <p className="text-xs font-bold text-ink">{selectedCitation.sourceNoteTitle}</p>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-600">
                        {compactText(selectedCitation.chunkText, 620)}
                      </p>
                    </div>
                  </section>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-ink">Answer sources</p>
                <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-4 text-sm leading-6 text-gray-500">
                  <FileText className="mb-3 text-gray-400" size={28} />
                  Ask returns citation blocks when retrieved context is sufficient.
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  )
}
