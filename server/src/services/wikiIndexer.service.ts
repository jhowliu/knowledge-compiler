import { env } from "../config/env.js";
import type { DraftUpdateProposal, KnowledgeExtraction } from "../domain/compiler.js";
import { linkableConceptNames } from "../domain/compiler.js";
import type { SearchResult } from "../domain/knowledge.js";
import type { RawNote } from "../domain/rawNote.js";
import type { RawSourceChunk, RawSourceRole } from "../domain/rawSource.js";

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
  extraction: KnowledgeExtraction;
  provider: "openai";
};

export type WikiIndexer = {
  extract(source: WikiIndexingSource): Promise<WikiIndexingResult>;
  draftProposal(
    source: WikiIndexingSource,
    extraction: KnowledgeExtraction,
    relatedNotes: SearchResult[],
  ): DraftUpdateProposal;
};

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "domain",
    "knowledgeType",
    "title",
    "summary",
    "concepts",
    "claims",
    "methods",
    "examples",
    "constraints",
    "confidence",
  ],
  properties: {
    domain: { type: "string" },
    knowledgeType: { type: "string" },
    title: { type: ["string", "null"] },
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

  draftProposal(source: WikiIndexingSource, extraction: KnowledgeExtraction, relatedNotes: SearchResult[]) {
    const title = knowledgeTitle(source, extraction);
    const knowledgeType = knowledgeTypeFor(extraction);
    const bodyMarkdown = knowledgeBodyMarkdown(source, extraction);
    const relatedCompiledNotes = relatedNotes
      .filter((note) => note.targetType === "compiled_note")
      .filter((note) => note.rank >= 1.5)
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
            structuredData: {
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
              summary: extraction.summary,
              concepts: extraction.concepts,
              claims: extraction.claims,
              methods: extraction.methods,
              examples: extraction.examples,
              constraints: extraction.constraints,
            },
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

  private async extractWithOpenAI(source: WikiIndexingSource): Promise<KnowledgeExtraction> {
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const chunkContext = source.chunks.length
      ? source.chunks
          .map((chunk) => {
            const heading = chunk.heading ? ` (${chunk.heading})` : "";
            return `Chunk ${chunk.chunkIndex + 1}${heading}:\n${chunk.bodyMarkdown}`;
          })
          .join("\n\n---\n\n")
      : source.bodyMarkdown;
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
              "Extract the source into general LLM-wiki indexing JSON. Source roles can be personal_note or reference; use the role only as context. Do not emit coding-problem-specific fields. Use only summary, concepts, claims, methods, examples, and constraints. Do not add recall questions. Concepts must include type, specificity, and confidence. Mark broad concepts as generic so they are not strong linking signals.",
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
            name: "knowledge_wiki_extraction",
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

    return JSON.parse(text) as KnowledgeExtraction;
  }
}

function knowledgeTypeFor(extraction: KnowledgeExtraction) {
  return extraction.knowledgeType.trim() || "knowledge_note";
}

function knowledgeTitle(source: Pick<RawNote, "title">, extraction: KnowledgeExtraction) {
  if (extraction.title) return extraction.title;
  const specificConcept = extraction.concepts.find((concept) => concept.specificity === "specific");
  if (specificConcept) return specificConcept.name;
  return source.title ?? "Untitled knowledge";
}

function section(title: string, lines: string[]) {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  return cleanLines.length ? [`## ${title}`, ...cleanLines.map((line) => `- ${line}`)].join("\n") : "";
}

function knowledgeBodyMarkdown(source: Pick<RawNote, "bodyMarkdown">, extraction: KnowledgeExtraction) {
  const methodLines = extraction.methods.map((method) => {
    const pieces = [method.purpose];
    if (method.conditions.length) pieces.push(`Conditions: ${method.conditions.join("; ")}`);
    if (method.steps.length) pieces.push(`Steps: ${method.steps.join("; ")}`);
    return `${method.name}: ${pieces.filter(Boolean).join(" ")}`;
  });
  const exampleLines = extraction.examples.map((example) =>
    [example.title, example.text, example.illustrates.length ? `Illustrates: ${example.illustrates.join(", ")}` : ""]
      .filter(Boolean)
      .join(" - "),
  );
  const constraintLines = extraction.constraints.map((constraint) =>
    constraint.appliesTo ? `${constraint.appliesTo}: ${constraint.text}` : constraint.text,
  );
  const conceptLines = linkableConceptNames(extraction.concepts);
  const sections = [
    extraction.summary.trim() ? `## Summary\n${extraction.summary.trim()}` : "",
    section("Claims", extraction.claims.map((claim) => claim.text)),
    section("Methods", methodLines),
    section("Examples", exampleLines),
    section("Constraints", constraintLines),
    section("Concepts", conceptLines),
  ].filter(Boolean);

  if (sections.length) {
    return sections.join("\n\n");
  }

  return source.bodyMarkdown;
}
