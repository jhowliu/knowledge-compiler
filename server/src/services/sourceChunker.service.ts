import type { CreateKnowledgeBlockInput } from "../domain/knowledge.js";
import type { CreateRawSourceChunkInput } from "../domain/rawSource.js";

const maxChunkCharacters = 1800;

// Semantic chunking tuning (knowledge blocks). Token estimate is roughly chars / 4,
// so these target ~300-700 token chunks with a hard cap before forced splitting.
const semanticTargetCharacters = 2800;
const semanticMergeCharacters = 1400;
const chunkStrategyVersion = "semantic-v1";

// Section labels commonly produced by the compiler or preserved from sources.
// Recognizing them lets a standalone label line (e.g. `**Steps:**`) act as a
// chunk boundary even when the author did not use a Markdown heading.
const knownSectionLabels = new Set<string>([
  "definition",
  "overview",
  "summary",
  "steps",
  "step",
  "algorithm",
  "example",
  "examples",
  "typical uses",
  "typical use",
  "use cases",
  "when to use",
  "when not to use",
  "common mistake",
  "common mistakes",
  "pitfalls",
  "caveat",
  "caveats",
  "constraint",
  "constraints",
  "complexity",
  "notes",
]);

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

function isFenceLine(line: string) {
  return /^\s*(```|~~~)/.test(line);
}

function isFenceClose(line: string) {
  return /^\s*(```|~~~)\s*$/.test(line);
}

// A standalone label line such as `Steps:`, `**Examples**`, or `_Caveats_`.
// Headings are handled separately, so this only matches inline section markers.
function labelFrom(line: string): { text: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 40) {
    return null;
  }
  const cleaned = trimmed
    .replace(/^[*_~`]+/, "")
    .replace(/[*_~`]+$/, "")
    .replace(/:$/, "")
    .trim();
  return knownSectionLabels.has(cleaned.toLowerCase()) ? { text: cleaned } : null;
}

export function chunkSourceMarkdown(markdown: string): CreateRawSourceChunkInput[] {
  return chunkMarkdown(markdown);
}

export function chunkKnowledgeMarkdown(markdown: string): CreateKnowledgeBlockInput[] {
  return chunkKnowledgeSemantically(markdown);
}

type RawSection = {
  headingPath: string[];
  heading: string | null;
  sourceHeading: string | null;
  lines: string[];
};

function sectionText(section: RawSection) {
  return section.lines.join("\n").trim();
}

// Split a note into candidate sections by Markdown headings and recognized
// section labels. Code fences are never crossed by a boundary.
function parseSections(markdown: string): RawSection[] {
  const lines = markdown.split("\n");
  const headingStack: { level: number; title: string }[] = [];
  const sections: RawSection[] = [];
  let fenceOpen = false;
  let current: RawSection = {
    headingPath: [],
    heading: null,
    sourceHeading: null,
    lines: [],
  };

  const flush = () => {
    if (sectionText(current)) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    if (fenceOpen) {
      current.lines.push(line);
      if (isFenceClose(line)) {
        fenceOpen = false;
      }
      continue;
    }
    if (isFenceLine(line)) {
      fenceOpen = true;
      current.lines.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, title });
      current = {
        headingPath: headingStack.map((entry) => entry.title),
        heading: title,
        sourceHeading: title,
        lines: [line],
      };
      continue;
    }

    const label = labelFrom(line);
    if (label) {
      flush();
      current = {
        headingPath: [...headingStack.map((entry) => entry.title), label.text],
        heading: label.text,
        sourceHeading: headingStack.length ? headingStack[headingStack.length - 1].title : null,
        lines: [line],
      };
      continue;
    }

    current.lines.push(line);
  }

  flush();
  return sections;
}

// Merge adjacent sections only when they carry the same heading and stay small.
// This avoids fragmenting e.g. several short "Example" subsections while never
// collapsing distinct sections (definition vs steps vs examples).
function mergeCompatibleSections(sections: RawSection[]): RawSection[] {
  const merged: RawSection[] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    const compatible =
      previous &&
      previous.heading !== null &&
      section.heading !== null &&
      previous.heading.toLowerCase() === section.heading.toLowerCase() &&
      sectionText(previous).length + sectionText(section).length <= semanticMergeCharacters;
    if (compatible) {
      previous.lines.push("", ...section.lines);
    } else {
      merged.push({ ...section, lines: [...section.lines] });
    }
  }
  return merged;
}

// Group a section's body into paragraph-aligned pieces under the size target,
// keeping code fences intact.
function splitSectionBody(body: string): string[] {
  const paragraphs = splitParagraphsPreservingFences(body);
  if (!paragraphs.length) {
    return [body.trim()].filter(Boolean);
  }

  const pieces: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > semanticTargetCharacters && current) {
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

function chunkKnowledgeSemantically(markdown: string): CreateKnowledgeBlockInput[] {
  const sections = mergeCompatibleSections(parseSections(markdown));

  if (!sections.length) {
    const body = markdown.trim();
    return [
      {
        blockIndex: 0,
        heading: null,
        bodyMarkdown: body || markdown,
        tokenEstimate: tokenEstimateFor(body || markdown),
        metadata: {
          sectionPath: [],
          sourceHeading: null,
          chunkStrategyVersion,
        },
      },
    ];
  }

  const blocks: CreateKnowledgeBlockInput[] = [];
  let blockIndex = 0;

  for (const section of sections) {
    const body = sectionText(section);
    const pieces =
      body.length > semanticTargetCharacters ? splitSectionBody(body) : [body];
    pieces.forEach((piece, pieceIndex) => {
      const metadata: Record<string, unknown> = {
        sectionPath: section.headingPath,
        sourceHeading: section.sourceHeading,
        chunkStrategyVersion,
      };
      if (pieces.length > 1) {
        metadata.partIndex = pieceIndex;
        metadata.partCount = pieces.length;
      }
      blocks.push({
        blockIndex: blockIndex++,
        heading: section.heading,
        bodyMarkdown: piece,
        tokenEstimate: tokenEstimateFor(piece),
        metadata,
      });
    });
  }

  return blocks;
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
