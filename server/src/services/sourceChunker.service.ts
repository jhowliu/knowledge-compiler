import type { CreateKnowledgeBlockInput } from "../domain/knowledge.js";
import type { CreateRawSourceChunkInput } from "../domain/rawSource.js";

const maxChunkCharacters = 1800;

// Knowledge blocks use mechanical fixed-size chunking (Anthropic-style): split
// into small chunks of a couple hundred tokens and let Contextual Retrieval add
// the situating context per chunk. Sizing is token-based so a typical structured
// note (definition / steps / examples / caveats) splits into a few blocks for
// retrieval precision rather than collapsing into one.
const knowledgeChunkTokens = 200;
const chunkStrategyVersion = "fixed-size-v1";

// Legacy chars/4 estimate, kept for raw-source chunking which is unchanged.
function tokenEstimateFor(markdown: string) {
  return Math.max(1, Math.ceil(markdown.length / 4));
}

// CJK-aware token estimate: latin text is ~4 chars/token, but CJK characters are
// roughly one token each, so chars/4 badly under-counts Chinese/Japanese notes.
// Counting CJK separately keeps chunk sizes consistent across languages.
function estimateTokens(text: string) {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (/[　-鿿가-퟿豈-﫿＀-￯]/.test(char)) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.max(1, Math.ceil(cjk + other / 4));
}

function headingFrom(markdown: string) {
  const heading = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));
  return heading ? heading.replace(/^#+\s*/, "").trim() || null : null;
}

function isFenceLine(line: string) {
  return /^\s*(```|~~~)/.test(line);
}

function isFenceClose(line: string) {
  return /^\s*(```|~~~)\s*$/.test(line);
}

export function chunkSourceMarkdown(markdown: string): CreateRawSourceChunkInput[] {
  return chunkMarkdown(markdown);
}

export function chunkKnowledgeMarkdown(markdown: string): CreateKnowledgeBlockInput[] {
  const pieces = splitFixedSize(markdown, knowledgeChunkTokens);
  const bodies = pieces.length ? pieces : [markdown.trim() || markdown];

  return bodies.map((bodyMarkdown, blockIndex) => ({
    blockIndex,
    heading: headingFrom(bodyMarkdown),
    bodyMarkdown,
    tokenEstimate: estimateTokens(bodyMarkdown),
    metadata: { chunkStrategyVersion },
  }));
}

// Group paragraphs up to a token target, keeping code fences intact. This is a
// fixed-size splitter with paragraph-aligned boundaries (no hardcoded section
// vocabulary); a single oversized paragraph (e.g. a large code fence) stays whole.
function splitFixedSize(markdown: string, targetTokens: number): string[] {
  const paragraphs = splitParagraphsPreservingFences(markdown);
  if (!paragraphs.length) {
    return [];
  }

  const pieces: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (estimateTokens(next) > targetTokens && current) {
      pieces.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) {
    pieces.push(current);
  }
  return pieces;
}

function splitParagraphsPreservingFences(markdown: string): string[] {
  const lines = markdown.split("\n");
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  let fenceOpen = false;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      paragraphs.push(text);
    }
    buffer = [];
  };

  for (const line of lines) {
    if (fenceOpen) {
      buffer.push(line);
      if (isFenceClose(line)) {
        fenceOpen = false;
      }
      continue;
    }
    if (isFenceLine(line)) {
      fenceOpen = true;
      buffer.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return paragraphs;
}

function chunkMarkdown(markdown: string): CreateRawSourceChunkInput[] {
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
