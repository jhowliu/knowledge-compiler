import type { CreateRawSourceChunkInput } from "../domain/rawSource.js";

const maxChunkCharacters = 1800;

function tokenEstimateFor(markdown: string) {
  return Math.max(1, Math.ceil(markdown.length / 4));
}

function headingFrom(markdown: string) {
  const heading = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));
  return heading ? heading.replace(/^#+\s*/, "").trim() || null : null;
}

export function chunkSourceMarkdown(markdown: string): CreateRawSourceChunkInput[] {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return [
      {
        chunkIndex: 0,
        heading: null,
        bodyMarkdown: markdown,
        tokenEstimate: tokenEstimateFor(markdown),
      },
    ];
  }

  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > maxChunkCharacters && current) {
      chunks.push(current);
      current = block;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((bodyMarkdown, chunkIndex) => ({
    chunkIndex,
    heading: headingFrom(bodyMarkdown),
    bodyMarkdown,
    tokenEstimate: tokenEstimateFor(bodyMarkdown),
  }));
}
