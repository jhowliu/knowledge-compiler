import { env } from "../config/env.js";
import type { DraftUpdateProposal, GeneralKnowledgeExtraction } from "../domain/compiler.js";
import type { SearchResult } from "../domain/knowledge.js";
import type { RawNote } from "../domain/rawNote.js";
import type { RawSourceChunk, RawSourceRole } from "../domain/rawSource.js";
import {
  normalizeKnowledgeStructuredData,
  renderKnowledgeFacetsMarkdown,
} from "./knowledgeFacets.service.js";

export type WikiIndexingSource = {
  id: string;
  rawNoteId: string | null;
  rawSourceId: string | null;
  userId: string | null;
  sourceRole: RawSourceRole;
  sourceType: string;
  title: string | null;
  bodyMarkdown: string;
  chunks: RawSourceChunk[];
};

export type WikiIndexingResult = {
  extraction: GeneralKnowledgeExtraction;
  provider: "openai";
};

export type WikiIndexer = {
  extract(source: WikiIndexingSource): Promise<WikiIndexingResult>;
  draftProposal(
    source: WikiIndexingSource,
    extraction: GeneralKnowledgeExtraction,
    relatedNotes: SearchResult[],
  ): DraftUpdateProposal;
};

const knowledgeStructuredDataSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "concepts", "claims", "methods", "examples", "constraints", "inferredSuggestions"],
  properties: {
    summary: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "specificity", "confidence"],
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["topic", "method", "entity", "framework", "term"] },
          specificity: { type: "string", enum: ["generic", "specific"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "confidence", "evidenceChunkIds"],
        properties: {
          text: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidenceChunkIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    methods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "purpose", "steps", "conditions"],
        properties: {
          name: { type: "string" },
          purpose: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          conditions: { type: "array", items: { type: "string" } },
        },
      },
    },
    examples: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text", "illustrates"],
        properties: {
          title: { type: ["string", "null"] },
          text: { type: "string" },
          illustrates: { type: "array", items: { type: "string" } },
        },
      },
    },
    constraints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "appliesTo"],
        properties: {
          text: { type: "string" },
          appliesTo: { type: ["string", "null"] },
        },
      },
    },
    inferredSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "reason", "confidence"],
        properties: {
          text: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
  },
};

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["domain", "knowledgeType", "title", "structuredData", "confidence"],
  properties: {
    domain: { type: "string" },
    knowledgeType: { type: "string" },
    title: { type: ["string", "null"] },
    structuredData: knowledgeStructuredDataSchema,
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

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

export class WikiIndexerService {
  async extract(source: WikiIndexingSource): Promise<WikiIndexingResult> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for LLM wiki indexing");
    }

    return { extraction: await this.extractWithOpenAI(source), provider: "openai" };
  }

  draftProposal(source: WikiIndexingSource, extraction: GeneralKnowledgeExtraction, relatedNotes: SearchResult[]) {
    const title = knowledgeTitle(source, extraction);
    const structuredData = normalizeKnowledgeStructuredData({
      ...extraction.structuredData,
      rawSourceId: source.rawSourceId,
      rawNoteId: source.rawNoteId,
      sourceRole: source.sourceRole,
      sourceType: source.sourceType,
      sourceChunks: source.chunks.map((chunk) => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading,
        tokenEstimate: chunk.tokenEstimate,
      })),
    });
    const knowledgeType = extraction.knowledgeType || "knowledge_note";
    const bodyMarkdown = renderKnowledgeFacetsMarkdown(structuredData, source.bodyMarkdown);
    const relatedCompiledNotes = relatedNotes
      .filter((note) => note.targetType === "compiled_note")
      .slice(0, 3);

    return {
      detectedDomain: extraction.domain,
      detectedKnowledgeType: knowledgeType,
      impactLevel: relatedCompiledNotes.length ? 3 : 2,
      confidence: extraction.confidence,
      rationale: `LLM wiki indexing proposed one approved knowledge update${
        relatedCompiledNotes.length ? ` and ${relatedCompiledNotes.length} related-note link suggestions` : ""
      }.`,
      items: [
        {
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: {
            domain: extraction.domain,
            knowledgeType,
            title,
            bodyMarkdown,
            structuredData,
          },
          rationale: "Create or update approved knowledge from this source.",
        },
        ...relatedCompiledNotes.map((note) => ({
          actionType: "create_link",
          targetType: "note_link",
          payload: {
            sourceTitle: title,
            sourceKnowledgeType: knowledgeType,
            targetNoteType: note.targetType,
            targetNoteId: note.id,
            targetTitle: note.title,
            relationType: "related_concept",
            confidence: extraction.confidence,
          },
          rationale: note.title
            ? `LLM wiki indexing found overlap with "${note.title}".`
            : "LLM wiki indexing found related approved knowledge.",
        })),
      ],
    };
  }

  private async extractWithOpenAI(source: WikiIndexingSource): Promise<GeneralKnowledgeExtraction> {
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const promptChunks = source.chunks.length
      ? source.chunks
      : [{
          id: `${source.id}:body`,
          chunkIndex: 0,
          heading: source.title,
          bodyMarkdown: source.bodyMarkdown,
          tokenEstimate: Math.max(1, Math.ceil(source.bodyMarkdown.length / 4)),
          rawSourceId: source.rawSourceId ?? source.id,
          metadata: {},
          createdAt: new Date(),
        }];
    const chunkContext = promptChunks
      .map((chunk) => {
        const heading = chunk.heading ? ` (${chunk.heading})` : "";
        return `Chunk ${chunk.chunkIndex + 1}${heading}\nChunk ID: ${chunk.id}\n${chunk.bodyMarkdown}`;
      })
      .join("\n\n---\n\n");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_WIKI_INDEX_MODEL,
        input: [
          {
            role: "system",
            content:
              "Extract the source into strict source-grounded LLM-wiki facets. The structuredData object is the source of truth; do not create coding/interview-specific top-level fields such as patterns, algorithms, recognition signals, key insights, implementation details, or common traps. Use concepts, claims, methods, examples, and constraints instead. Only include content directly supported by the source text. Do not add facts, algorithms, steps, traps, examples, terminology, or conclusions from outside knowledge. Every claim must cite one or more provided Chunk IDs in evidenceChunkIds. If a useful idea seems likely but is not explicitly supported by the source, put it in inferredSuggestions instead of claims, methods, examples, constraints, or summary. Source roles can be personal_note or reference; use the role as context without forcing an interview-specific classification.",
          },
          {
            role: "user",
            content: `Source role: ${source.sourceRole}\nSource type: ${source.sourceType}\nTitle: ${
              source.title ?? "Untitled"
            }\nRaw source id: ${source.rawSourceId ?? "none"}\nRaw note id: ${
              source.rawNoteId ?? "none"
            }\n\n${chunkContext}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "general_wiki_extraction",
            strict: true,
            schema: extractionSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI wiki index request failed with ${response.status}`);
    }

    const text = outputText(await response.json());
    if (!text) {
      throw new Error("OpenAI wiki index response did not include output text");
    }

    return normalizeExtraction(JSON.parse(text));
  }
}

function knowledgeTitle(source: Pick<RawNote, "title">, extraction: GeneralKnowledgeExtraction) {
  if (extraction.title) {
    return extraction.title;
  }
  const specificConcept = extraction.structuredData.concepts.find(
    (concept) => concept.specificity === "specific",
  );
  if (specificConcept) {
    return specificConcept.name;
  }
  return source.title ?? "Untitled knowledge";
}

function normalizeExtraction(value: unknown): GeneralKnowledgeExtraction {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const confidence = record.confidence === "low" || record.confidence === "medium" || record.confidence === "high"
    ? record.confidence
    : "medium";

  return {
    domain: typeof record.domain === "string" && record.domain.trim() ? record.domain.trim() : "general",
    knowledgeType:
      typeof record.knowledgeType === "string" && record.knowledgeType.trim()
        ? record.knowledgeType.trim()
        : "knowledge_note",
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : null,
    structuredData: normalizeKnowledgeStructuredData(record.structuredData),
    confidence,
  };
}
