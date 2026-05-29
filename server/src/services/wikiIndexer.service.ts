import { env } from "../config/env.js";
import type { CodingExtraction } from "../domain/compiler.js";
import type { SearchResult } from "../domain/knowledge.js";
import type { RawNote } from "../domain/rawNote.js";
import { CodingCompilerService } from "./codingCompiler.service.js";

export type WikiIndexingResult = {
  extraction: CodingExtraction;
  provider: "openai";
};

export type WikiIndexer = {
  extract(rawNote: RawNote): Promise<WikiIndexingResult>;
  draftProposal(
    rawNote: RawNote,
    extraction: CodingExtraction,
    relatedNotes: SearchResult[],
  ): ReturnType<CodingCompilerService["draftProposal"]>;
};

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "domain",
    "knowledgeType",
    "problemNumber",
    "problemTitle",
    "reviewMapName",
    "decisionRules",
    "commonTraps",
    "patterns",
    "algorithms",
    "recognitionSignals",
    "keyInsights",
    "mistakes",
    "implementationDetails",
    "reviewActions",
    "concepts",
    "confidence",
  ],
  properties: {
    domain: { type: "string", enum: ["coding"] },
    knowledgeType: {
      type: "string",
      enum: ["problem_reflection", "review_map", "general_coding_note"],
    },
    problemNumber: { type: ["string", "null"] },
    problemTitle: { type: ["string", "null"] },
    reviewMapName: { type: ["string", "null"] },
    decisionRules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "recommendation", "confidence"],
        properties: {
          signal: { type: "string" },
          recommendation: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    commonTraps: { type: "array", items: { type: "string" } },
    patterns: { type: "array", items: { type: "string" } },
    algorithms: { type: "array", items: { type: "string" } },
    recognitionSignals: { type: "array", items: { type: "string" } },
    keyInsights: { type: "array", items: { type: "string" } },
    mistakes: { type: "array", items: { type: "string" } },
    implementationDetails: { type: "array", items: { type: "string" } },
    reviewActions: { type: "array", items: { type: "string" } },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "conceptType", "confidence"],
        properties: {
          name: { type: "string" },
          conceptType: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
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
  constructor(private readonly deterministicCompiler = new CodingCompilerService()) {}

  async extract(rawNote: RawNote): Promise<WikiIndexingResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for LLM wiki indexing");
    }

    return { extraction: await this.extractWithOpenAI(rawNote), provider: "openai" };
  }

  draftProposal(rawNote: RawNote, extraction: CodingExtraction, relatedNotes: SearchResult[]) {
    return this.deterministicCompiler.draftProposal(rawNote, extraction, relatedNotes);
  }

  private async extractWithOpenAI(rawNote: RawNote): Promise<CodingExtraction> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_WIKI_INDEX_MODEL,
        input: [
          {
            role: "system",
            content:
              "Extract the source into LLM-wiki indexing JSON. Source roles can be personal_note or reference; use the role only as context, and do not force an interview-specific classification when the text does not support it. Use multi-axis indexing: algorithms, patterns, constraint models, implementation schemas, mistakes, and review actions. Do not invent problem numbers.",
          },
          {
            role: "user",
            content: `Source role: ${rawNote.sourceRole}\nSource type: ${rawNote.sourceType}\nTitle: ${rawNote.title ?? "Untitled"}\n\n${rawNote.bodyMarkdown}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "coding_wiki_extraction",
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

    return JSON.parse(text) as CodingExtraction;
  }
}
