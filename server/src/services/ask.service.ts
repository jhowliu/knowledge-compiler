import { env } from "../config/env.js";
import type { AskCitation, AskResponse } from "../domain/ask.js";
import type { KnowledgeBlockSearchResult } from "../domain/knowledge.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { RawSourceRepository } from "../repositories/rawSource.repository.js";

const notEnoughInformationAnswer =
  "I don't have enough information in the approved knowledge base to answer that.";

// Scoping rules keep answers tied to the user's exact question instead of
// summarizing whole retrieved blocks. Exported so prompt contract tests can
// assert the scoping rules stay in place.
export const askSystemPrompt = [
  "Answer the user's exact question using only the retrieved knowledge blocks. Do not use outside knowledge.",
  "If the blocks do not contain enough information, say so explicitly.",
  "Scope the answer to exactly what was asked; do not summarize the whole block:",
  "- If the user asks for examples, return only the examples.",
  "- If the user asks for a definition, give a concise definition first.",
  "- Do not include unrelated steps, caveats, or background unless the question asks for them.",
  "- If only part of a block is relevant, cite that block but do not restate its unrelated content.",
  "Keep answers concise by default; prefer the smallest answer that fully addresses the question.",
  "Attribute claims with citation markers like [1], [2] that match the provided block numbers.",
].join("\n");

export type AskContextBlock = {
  citationIndex: number;
  blockId: string;
  title: string;
  heading: string | null;
  bodyMarkdown: string;
  sourceNoteId: string;
  tier: "knowledge" | "source";
};

const sourceContextNote =
  "Some retrieved context comes from the user's raw source notes rather than curated knowledge. You may answer from them, but attribute them accurately.";

export type AskAnswerer = {
  answer(input: {
    query: string;
    blocks: AskContextBlock[];
    citations: AskCitation[];
  }): Promise<string>;
};

export class OpenAIAskAnswerer implements AskAnswerer {
  async answer(input: {
    query: string;
    blocks: AskContextBlock[];
    citations: AskCitation[];
  }) {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for RAG answers");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.ASK_MODEL,
        input: [
          {
            role: "system",
            content: askSystemPrompt,
          },
          ...(input.blocks.some((block) => block.tier === "source")
            ? [{ role: "system", content: sourceContextNote }]
            : []),
          {
            role: "user",
            content: [
              `Question:\n${input.query}`,
              "Retrieved blocks:",
              ...input.blocks.map((block) =>
                [
                  `[${block.citationIndex}] ${block.title}${block.tier === "source" ? " (raw source)" : ""}`,
                  block.heading ? `Heading: ${block.heading}` : null,
                  `Source note id: ${block.sourceNoteId}`,
                  `Block id: ${block.blockId}`,
                  block.bodyMarkdown,
                ].filter(Boolean).join("\n"),
              ),
            ].join("\n\n---\n\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI ask request failed with ${response.status}`);
    }

    const text = outputText(await response.json());
    if (!text) {
      throw new Error("OpenAI ask response did not include output text");
    }

    return text.trim();
  }
}

export class AskService {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly answerer: AskAnswerer = new OpenAIAskAnswerer(),
    private readonly rawSourceRepository: RawSourceRepository | null = null,
  ) {}

  async ask(input: { query: string }): Promise<AskResponse> {
    const query = input.query.trim();
    if (!query) {
      return { answer: notEnoughInformationAnswer, citations: [] };
    }

    const seedBlocks = await this.knowledgeRepository.searchKnowledgeBlocks({
      query,
      limit: 8,
    });
    if (seedBlocks.length === 0) {
      // No approved knowledge — fall back to the user's raw source notes (#143),
      // tagged as source provenance so the caller can show where it came from.
      return this.answerFromSources(query);
    }

    const rankedBlocks = seedBlocks.slice(0, 8);
    const citations = rankedBlocks.map((block) => citationFromBlock(block));
    const contextBlocks: AskContextBlock[] = rankedBlocks.map((block, index) => ({
      citationIndex: index + 1,
      blockId: block.blockId,
      title: block.title,
      heading: block.heading,
      bodyMarkdown: block.bodyMarkdown,
      sourceNoteId: citations[index].sourceNoteId,
      tier: "knowledge",
    }));

    return {
      answer: await this.answerer.answer({ query, blocks: contextBlocks, citations }),
      citations,
    };
  }

  private async answerFromSources(query: string): Promise<AskResponse> {
    if (!this.rawSourceRepository) {
      return { answer: notEnoughInformationAnswer, citations: [] };
    }

    const chunks = await this.rawSourceRepository.searchRawSourceChunks({
      query,
      limit: 8,
    });
    if (chunks.length === 0) {
      return { answer: notEnoughInformationAnswer, citations: [] };
    }

    const citations: AskCitation[] = chunks.map((chunk) => ({
      blockId: chunk.chunkId,
      title: chunk.title ?? "Untitled source",
      chunkText: chunk.bodyMarkdown,
      sourceNoteTitle: chunk.title ?? "Untitled source",
      sourceNoteId: chunk.rawSourceId,
      tier: "source",
    }));
    const contextBlocks: AskContextBlock[] = chunks.map((chunk, index) => ({
      citationIndex: index + 1,
      blockId: chunk.chunkId,
      title: chunk.title ?? "Untitled source",
      heading: chunk.heading,
      bodyMarkdown: chunk.bodyMarkdown,
      sourceNoteId: chunk.rawSourceId,
      tier: "source",
    }));

    return {
      answer: await this.answerer.answer({ query, blocks: contextBlocks, citations }),
      citations,
    };
  }
}

function citationFromBlock(block: KnowledgeBlockSearchResult): AskCitation {
  const evidence = block.evidenceReferences[0] ?? null;
  return {
    blockId: block.blockId,
    title: block.title,
    chunkText: evidence?.chunkBodyMarkdown || block.bodyMarkdown,
    sourceNoteTitle: evidence?.rawSourceTitle || evidence?.sourceTitle || block.title,
    sourceNoteId: evidence?.rawSourceId || evidence?.sourceId || block.knowledgeSourceId,
    tier: "knowledge",
  };
}

function outputText(response: unknown) {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") continue;
      const text = (contentItem as Record<string, unknown>).text;
      if (typeof text === "string") {
        return text;
      }
    }
  }
  return null;
}
