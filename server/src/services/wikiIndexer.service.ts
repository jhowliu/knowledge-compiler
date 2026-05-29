import { env } from "../config/env.js";
import type { CodingExtraction, DraftUpdateProposal } from "../domain/compiler.js";
import type { SearchResult } from "../domain/knowledge.js";
import type { RawNote } from "../domain/rawNote.js";

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
  ): DraftUpdateProposal;
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
  async extract(rawNote: RawNote): Promise<WikiIndexingResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for LLM wiki indexing");
    }

    return { extraction: await this.extractWithOpenAI(rawNote), provider: "openai" };
  }

  draftProposal(rawNote: RawNote, extraction: CodingExtraction, relatedNotes: SearchResult[]) {
    const title = knowledgeTitle(rawNote, extraction);
    const knowledgeType = knowledgeTypeFor(extraction);
    const bodyMarkdown = knowledgeBodyMarkdown(rawNote, extraction);
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
            structuredData: {
              sourceRole: rawNote.sourceRole,
              sourceType: rawNote.sourceType,
              originalKnowledgeType: extraction.knowledgeType,
              problemNumber: extraction.problemNumber,
              problemTitle: extraction.problemTitle,
              reviewMapName: extraction.reviewMapName,
              decisionRules: extraction.decisionRules,
              commonTraps: extraction.commonTraps,
              patterns: extraction.patterns,
              algorithms: extraction.algorithms,
              recognitionSignals: extraction.recognitionSignals,
              keyInsights: extraction.keyInsights,
              implementationDetails: extraction.implementationDetails,
              concepts: extraction.concepts,
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
              "Extract the source into LLM-wiki indexing JSON. Source roles can be personal_note or reference; use the role only as context, and do not force an interview-specific classification when the text does not support it. Prefer general knowledge signals: concepts, claims, patterns, algorithms, constraints, recognition signals, and implementation details. Do not invent problem numbers. Mistake and review-action fields are legacy extraction fields only; leave them empty unless the source explicitly states them.",
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

function knowledgeTypeFor(extraction: CodingExtraction) {
  if (extraction.knowledgeType === "review_map") {
    return "review_map";
  }
  if (extraction.knowledgeType === "problem_reflection") {
    return "problem_note";
  }
  if (extraction.algorithms.length > 0) {
    return "algorithm";
  }
  if (extraction.patterns.length > 0) {
    return "pattern";
  }
  return "knowledge_note";
}

function knowledgeTitle(rawNote: RawNote, extraction: CodingExtraction) {
  if (extraction.reviewMapName) {
    return extraction.reviewMapName;
  }
  if (extraction.problemNumber && extraction.problemTitle) {
    return `${extraction.problemNumber}. ${extraction.problemTitle}`;
  }
  if (extraction.problemTitle) {
    return extraction.problemTitle;
  }
  if (extraction.algorithms[0]) {
    return extraction.algorithms[0];
  }
  if (extraction.patterns[0]) {
    return extraction.patterns[0];
  }
  return rawNote.title ?? "Untitled knowledge";
}

function section(title: string, lines: string[]) {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  return cleanLines.length ? [`## ${title}`, ...cleanLines.map((line) => `- ${line}`)].join("\n") : "";
}

function knowledgeBodyMarkdown(rawNote: RawNote, extraction: CodingExtraction) {
  const sections = [
    section("Key insights", extraction.keyInsights),
    section("Recognition signals", extraction.recognitionSignals),
    section("Implementation details", extraction.implementationDetails),
    section("Patterns", extraction.patterns),
    section("Algorithms", extraction.algorithms),
    section("Common traps", extraction.commonTraps),
  ].filter(Boolean);

  if (sections.length) {
    return sections.join("\n\n");
  }

  return rawNote.bodyMarkdown;
}
