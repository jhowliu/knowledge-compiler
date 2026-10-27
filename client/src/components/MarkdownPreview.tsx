import React from 'react'

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-ink" key={index}>
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

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  const blocks: React.ReactNode[] = []
  let codeLines: string[] = []
  let inCodeBlock = false

  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(
          <pre
            className="my-4 overflow-x-auto rounded-lg border border-gray-200 bg-slate-100 p-4 font-mono text-xs leading-5 text-ink"
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
      blocks.push(<div aria-hidden className="h-3" key={`space-${index}`} />)
      return
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const className =
        level === 1
          ? 'mt-2 text-2xl font-bold text-ink'
          : level === 2
            ? 'mt-2 text-xl font-bold text-ink'
            : 'mt-2 text-base font-bold text-ink'
      const Heading = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      blocks.push(
        <Heading className={className} key={`heading-${index}`}>
          {renderInlineMarkdown(heading[2])}
        </Heading>,
      )
      return
    }

    const quote = line.match(/^>\s+(.+)$/)
    if (quote) {
      blocks.push(
        <blockquote
          className="border-l-2 border-violet pl-3 text-[14px] italic leading-7 text-gray-600"
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
        <div className="flex gap-2 text-[14px] leading-7 text-gray-700" key={`list-${index}`}>
          <span aria-hidden className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
          <p>{renderInlineMarkdown(listItem[1])}</p>
        </div>,
      )
      return
    }

    blocks.push(
      <p className="text-[14px] leading-7 text-gray-700" key={`paragraph-${index}`}>
        {renderInlineMarkdown(line)}
      </p>,
    )
  })

  return <div className="space-y-1">{blocks}</div>
}
