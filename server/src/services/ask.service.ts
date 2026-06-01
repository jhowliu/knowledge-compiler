import { env } from "../config/env.js";
import type { AskCitation, AskResponse } from "../domain/ask.js";
import type { KnowledgeBlockSearchResult } from "../domain/knowledge.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";
import type { NoteLinkRepository } from "../repositories/noteLink.repository.js";
import { KnowledgeRetrievalService } from "./knowledgeRetrieval.service.js";

const notEnoughInformationAnswer =
  "I don't have enough information in the approved knowledge base to answer that.";

export type AskContextBlock = KnowledgeBlockSearchResult & {
  citationIndex: number;
};

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
            content:
              "Answer strictly from the retrieved knowledge blocks. Do not use outside knowledge. If the blocks do not contain enough information, say so explicitly. Attribute claims with citation markers like [1], [2] that match the provided block numbers.",
          },
          {
            role: "user",
            content: [
              `Question:\n${input.query}`,
              "Retrieved blocks:",
              ...input.blocks.map((block) =>
                [
                  `[${block.citationIndex}] ${block.title}`,
                  block.heading ? `Heading: ${block.heading}` : null,
                  `Source note id: ${citationForBlock(block, input.citations)?.sourceNoteId ?? block.knowledgeSourceId}`,
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
    private readonly noteLinkRepository: NoteLinkRepository,
    private readonly knowledgeRetrievalService = new KnowledgeRetrievalService(knowledgeRepository),
    private readonly answerer: AskAnswerer = new OpenAIAskAnswerer(),
  ) {}

  async ask(input: { query: string; topicIds?: string[] }): Promise<AskResponse> {
    const query = input.query.trim();
    if (!query) {
      return { answer: notEnoughInformationAnswer, citations: [] };
    }

    const seedBlocks = await this.knowledgeRetrievalService.search({
      query,
      limit: 8,
      topicIds: input.topicIds ?? [],
    });
    if (seedBlocks.length === 0) {
      return { answer: notEnoughInformationAnswer, citations: [] };
    }

    const graphBlocks = await this.loadOneHopBlocks(seedBlocks, input.topicIds ?? []);
    const rankedBlocks = mergeAndRankBlocks([...seedBlocks, ...graphBlocks]).slice(0, 8);
    const citations = rankedBlocks.map((block) => citationFromBlock(block));
    const contextBlocks = rankedBlocks.map((block, index) => ({
      ...block,
      citationIndex: index + 1,
    }));

    return {
      answer: await this.answerer.answer({ query, blocks: contextBlocks, citations }),
      citations,
    };
  }

  private async loadOneHopBlocks(
    blocks: KnowledgeBlockSearchResult[],
    topicIds: string[],
  ): Promise<KnowledgeBlockSearchResult[]> {
    const linkedCompiledNoteIds = new Set<string>();
    for (const block of blocks) {
      if (!block.compiledNoteId) {
        continue;
      }
      const links = await this.noteLinkRepository.listForNote({
        noteType: "compiled_note",
        noteId: block.compiledNoteId,
        statuses: ["approved"],
        limit: 8,
      });
      for (const link of links) {
        const neighborId =
          link.sourceNoteType === "compiled_note" && link.sourceNoteId !== block.compiledNoteId
            ? link.sourceNoteId
            : link.targetNoteType === "compiled_note" && link.targetNoteId !== block.compiledNoteId
              ? link.targetNoteId
              : null;
        if (neighborId) {
          linkedCompiledNoteIds.add(neighborId);
        }
      }
    }

    return this.knowledgeRepository.listKnowledgeBlocksByCompiledNoteIds({
      compiledNoteIds: [...linkedCompiledNoteIds],
      limit: 12,
      topicIds,
    });
  }
}

function mergeAndRankBlocks(blocks: KnowledgeBlockSearchResult[]) {
  const byId = new Map<string, KnowledgeBlockSearchResult>();
  for (const block of blocks) {
    const existing = byId.get(block.blockId);
    if (!existing || block.rank > existing.rank) {
      byId.set(block.blockId, block);
    }
  }
  return [...byId.values()].sort((left, right) => {
    if (right.rank !== left.rank) {
      return right.rank - left.rank;
    }
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

function citationFromBlock(block: KnowledgeBlockSearchResult): AskCitation {
  const evidence = block.evidenceReferences[0] ?? null;
  return {
    blockId: block.blockId,
    title: block.title,
    chunkText: evidence?.chunkBodyMarkdown || block.bodyMarkdown,
    sourceNoteTitle: evidence?.rawSourceTitle || evidence?.sourceTitle || block.title,
    sourceNoteId: evidence?.rawSourceId || evidence?.sourceId || block.knowledgeSourceId,
  };
}

function citationForBlock(block: KnowledgeBlockSearchResult, citations: AskCitation[]) {
  return citations.find((citation) => citation.blockId === block.blockId) ?? null;
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
