import React from 'react'

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
