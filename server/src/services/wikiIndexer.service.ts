import { env } from "../config/env.js";
import type {
  DraftUpdateProposal,
  GeneralKnowledgeExtraction,
  IndexingOutcome,
} from "../domain/compiler.js";
import type { Confidence, SearchResult } from "../domain/knowledge.js";
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
  topicNames?: string[];
  chunks: RawSourceChunk[];
};

export type WikiIndexingResult = {
  extraction: GeneralKnowledgeExtraction;
  provider: "openai";
};

/** A knowledge block the agent retrieved before deciding the indexing outcome. */
export type OutcomeCandidateBlock = {
  block_id: string;
  title: string;
  heading: string | null;
  body_markdown_preview: string;
};

export type OutcomeClassificationInput = {
  source: WikiIndexingSource;
  extraction: GeneralKnowledgeExtraction;
  candidateBlocks: OutcomeCandidateBlock[];
  conceptMatches: string[];
};

export type ConflictResolution = "update" | "keep_both" | "needs_user_decision";

/**
 * The outcome decision made AFTER the knowledge base has been searched.
 * `targetBlockId` is the block the agent chose to update (only for
 * `update_existing_knowledge`). Conflict detection is part of this reasoned
 * decision rather than a keyword heuristic over the source text.
 */
export type OutcomeClassification = {
  outcome: IndexingOutcome;
  outcomeReason: string;
  targetBlockId: string | null;
  confidence: Confidence;
  conflictDetected: boolean;
  conflictSummary: string | null;
  conflictResolution: ConflictResolution | null;
};

export type WikiIndexer = {
  extract(source: WikiIndexingSource): Promise<WikiIndexingResult>;
  draftProposal(
    source: WikiIndexingSource,
    extraction: GeneralKnowledgeExtraction,
    relatedNotes: SearchResult[],
  ): DraftUpdateProposal;
  /**
   * Re-decides the indexing outcome once candidate blocks are known. Optional so
   * that lightweight/test indexers can omit it and fall back to the provisional
   * outcome from {@link extract}.
   */
  classifyOutcome?(input: OutcomeClassificationInput): Promise<OutcomeClassification>;
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
  required: ["domain", "knowledgeType", "title", "outcome", "outcomeReason", "structuredData", "confidence"],
  properties: {
    domain: { type: "string" },
    knowledgeType: { type: "string" },
    title: { type: ["string", "null"] },
    outcome: {
      type: "string",
      enum: ["keep_searchable", "create_knowledge", "update_existing_knowledge"],
    },
    outcomeReason: { type: "string" },
    structuredData: knowledgeStructuredDataSchema,
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

const outcomeClassificationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "outcome",
    "outcomeReason",
    "targetBlockId",
    "confidence",
    "conflictDetected",
    "conflictSummary",
    "conflictResolution",
  ],
  properties: {
    outcome: {
      type: "string",
      enum: ["keep_searchable", "create_knowledge", "update_existing_knowledge"],
    },
    outcomeReason: { type: "string" },
    targetBlockId: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    conflictDetected: { type: "boolean" },
    conflictSummary: { type: ["string", "null"] },
    conflictResolution: {
      type: ["string", "null"],
      enum: ["update", "keep_both", "needs_user_decision", null],
    },
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

  async classifyOutcome(input: OutcomeClassificationInput): Promise<OutcomeClassification> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for indexing outcome classification");
    }

    const { source, extraction, candidateBlocks, conceptMatches } = input;
    const candidateContext = candidateBlocks.length
      ? candidateBlocks
          .map(
            (block) =>
              `Block ID: ${block.block_id}\nTitle: ${block.title}${
                block.heading ? ` (${block.heading})` : ""
              }\nPreview: ${block.body_markdown_preview}`,
          )
          .join("\n\n---\n\n")
      : "No existing knowledge blocks matched this source.";

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.INDEXER_MODEL,
        input: [
          {
            role: "system",
            content:
              "You are the LLM wiki editor deciding what to do with a source AFTER searching the existing knowledge base. Decide one outcome: keep_searchable when the source is not reusable knowledge (interview drafts, self-introductions, pitches, meeting notes, TODOs, one-off personal artifacts); update_existing_knowledge when one of the provided candidate blocks already covers this concept and should be revised/merged rather than duplicated; create_knowledge only when the source teaches reusable knowledge that no candidate block already covers. Judge meaning, not keywords, and apply the same rules regardless of the language the source is written in. Prefer update_existing_knowledge over creating a near-duplicate. When you choose update_existing_knowledge you MUST set targetBlockId to the Block ID of the block to update; otherwise set targetBlockId to null. Also assess whether the source contradicts the targeted block: set conflictDetected true only when it genuinely contradicts or revises that block, and then provide a conflictSummary describing the contradiction and a conflictResolution of update, keep_both, or needs_user_decision. When there is no contradiction set conflictDetected false, conflictSummary null, and conflictResolution null. Base the decision only on the provided extraction, candidate blocks, concept matches, and topics.",
          },
          {
            role: "user",
            content: `Provisional outcome from extraction: ${extraction.outcome}\nProvisional reason: ${extraction.outcomeReason}\nSource title: ${
              source.title ?? "Untitled"
            }\nTopics: ${(source.topicNames ?? []).join(", ") || "none"}\nExtraction summary: ${
              extraction.structuredData.summary
            }\nExtracted concepts: ${extraction.structuredData.concepts
              .map((concept) => concept.name)
              .join(", ") || "none"}\nConcept index matches: ${conceptMatches.join(", ") || "none"}\n\nCandidate knowledge blocks:\n${candidateContext}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "indexing_outcome_classification",
            strict: true,
            schema: outcomeClassificationSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI outcome classification request failed with ${response.status}`);
    }

    const text = outputText(await response.json());
    if (!text) {
      throw new Error("OpenAI outcome classification response did not include output text");
    }

    return normalizeOutcomeClassification(JSON.parse(text), extraction, candidateBlocks);
  }

  draftProposal(source: WikiIndexingSource, extraction: GeneralKnowledgeExtraction, relatedNotes: SearchResult[]) {
    // The outcome (keep/create/update) is decided by the LLM in extract/classifyOutcome.
    const routedExtraction = extraction;
    const title = knowledgeTitle(source, routedExtraction);
    const structuredData = normalizeKnowledgeStructuredData({
      ...routedExtraction.structuredData,
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
    const knowledgeType = routedExtraction.knowledgeType || "knowledge_note";
    const bodyMarkdown = renderKnowledgeFacetsMarkdown(structuredData, source.bodyMarkdown);
    const relatedCompiledNotes = relatedNotes
      .filter((note) => note.targetType === "compiled_note")
      .slice(0, 3);
    const targetCompiledNote = routedExtraction.outcome === "update_existing_knowledge"
      ? relatedCompiledNotes[0] ?? null
      : null;
    const knowledgePayload = {
      domain: routedExtraction.domain,
      knowledgeType,
      title,
      bodyMarkdown,
      structuredData,
      outcome: routedExtraction.outcome,
      outcomeReason: routedExtraction.outcomeReason,
      targetCompiledNoteId: targetCompiledNote?.id ?? null,
      targetTitle: targetCompiledNote?.title ?? null,
    };

    if (routedExtraction.outcome === "keep_searchable") {
      return {
        detectedDomain: routedExtraction.domain,
        detectedKnowledgeType: knowledgeType,
        impactLevel: 1,
        confidence: routedExtraction.confidence,
        rationale: `Recommended: Keep searchable. ${routedExtraction.outcomeReason}`,
        items: [
          {
            actionType: "keep_source_searchable",
            targetType: source.rawSourceId ? "raw_source" : "raw_note",
            payload: {
              outcome: routedExtraction.outcome,
              outcomeReason: routedExtraction.outcomeReason,
              title: source.title ?? title,
              sourceRole: source.sourceRole,
              sourceType: source.sourceType,
              rawSourceId: source.rawSourceId,
              rawNoteId: source.rawNoteId,
              concepts: structuredData.concepts,
              sourceChunks: structuredData.sourceChunks,
              knowledgeProposal: knowledgePayload,
            },
            rationale: routedExtraction.outcomeReason,
          },
        ],
      };
    }

    return {
      detectedDomain: routedExtraction.domain,
      detectedKnowledgeType: knowledgeType,
      impactLevel: routedExtraction.outcome === "update_existing_knowledge" ? 3 : relatedCompiledNotes.length ? 3 : 2,
      confidence: routedExtraction.confidence,
      rationale: `Recommended: ${outcomeLabel(routedExtraction.outcome)}. ${routedExtraction.outcomeReason} LLM wiki indexing proposed one approved knowledge update${
        relatedCompiledNotes.length ? ` and ${relatedCompiledNotes.length} related-note link suggestions` : ""
      }.`,
      items: [
        {
          actionType: "upsert_knowledge",
          targetType: "knowledge_source",
          payload: knowledgePayload,
          rationale: routedExtraction.outcomeReason || "Create or update approved knowledge from this source.",
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
            confidence: routedExtraction.confidence,
            indexingOutcome: routedExtraction.outcome,
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
              "Extract the source into strict source-grounded LLM-wiki facets and choose an indexing outcome before drafting knowledge. Use outcome keep_searchable when the content is useful to search but would be strange as a reusable Knowledge Note, including interview answer drafts, self-introduction scripts, resume/project pitches, meeting notes, TODOs, and one-off personal artifacts. Use create_knowledge or update_existing_knowledge only when the source teaches a reusable method, framework, claim, constraint, technical explanation, or concept outside the original source. Do not create knowledge merely because the source has a title or extractable concepts. The structuredData object is the source of truth; do not create coding/interview-specific top-level fields such as patterns, algorithms, recognition signals, key insights, implementation details, or common traps. Use concepts, claims, methods, examples, and constraints instead. Only include content directly supported by the source text. Do not add facts, algorithms, steps, traps, examples, terminology, or conclusions from outside knowledge. Every claim must cite one or more provided Chunk IDs in evidenceChunkIds. If a useful idea seems likely but is not explicitly supported by the source, put it in inferredSuggestions instead of claims, methods, examples, constraints, or summary. Source roles can be personal_note or reference; use the role as context without forcing an interview-specific classification.",
          },
          {
            role: "user",
            content: `Source role: ${source.sourceRole}\nSource type: ${source.sourceType}\nTitle: ${
              source.title ?? "Untitled"
            }\nTopics: ${(source.topicNames ?? []).join(", ") || "none"}\nRaw source id: ${
              source.rawSourceId ?? "none"
            }\nRaw note id: ${source.rawNoteId ?? "none"}\n\n${chunkContext}`,
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

function outcomeLabel(outcome: IndexingOutcome) {
  if (outcome === "keep_searchable") return "Keep searchable";
  if (outcome === "update_existing_knowledge") return "Update existing knowledge";
  return "Create knowledge note";
}

function normalizeOutcomeClassification(
  value: unknown,
  extraction: GeneralKnowledgeExtraction,
  candidateBlocks: OutcomeCandidateBlock[],
): OutcomeClassification {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const outcome: IndexingOutcome =
    record.outcome === "keep_searchable" ||
    record.outcome === "create_knowledge" ||
    record.outcome === "update_existing_knowledge"
      ? record.outcome
      : extraction.outcome;
  const confidence: Confidence =
    record.confidence === "low" || record.confidence === "medium" || record.confidence === "high"
      ? record.confidence
      : extraction.confidence;
  const candidateIds = new Set(candidateBlocks.map((block) => block.block_id));
  const proposedTargetId = typeof record.targetBlockId === "string" ? record.targetBlockId : null;
  // Only trust a target the model could actually see; otherwise drop to create.
  const targetBlockId =
    outcome === "update_existing_knowledge" && proposedTargetId && candidateIds.has(proposedTargetId)
      ? proposedTargetId
      : null;

  const finalOutcome: IndexingOutcome =
    outcome === "update_existing_knowledge" && !targetBlockId ? "create_knowledge" : outcome;

  // Conflict only applies to an update against a real target block, and the
  // contract requires a summary + resolution whenever it is flagged.
  const conflictResolution: ConflictResolution | null =
    record.conflictResolution === "update" ||
    record.conflictResolution === "keep_both" ||
    record.conflictResolution === "needs_user_decision"
      ? record.conflictResolution
      : null;
  const conflictSummary =
    typeof record.conflictSummary === "string" && record.conflictSummary.trim()
      ? record.conflictSummary.trim()
      : null;
  const conflictDetected =
    record.conflictDetected === true &&
    finalOutcome === "update_existing_knowledge" &&
    Boolean(targetBlockId) &&
    Boolean(conflictSummary) &&
    Boolean(conflictResolution);

  return {
    outcome: finalOutcome,
    outcomeReason:
      typeof record.outcomeReason === "string" && record.outcomeReason.trim()
        ? record.outcomeReason.trim()
        : extraction.outcomeReason,
    targetBlockId,
    confidence,
    conflictDetected,
    conflictSummary: conflictDetected ? conflictSummary : null,
    conflictResolution: conflictDetected ? conflictResolution : null,
  };
}

function normalizeExtraction(value: unknown): GeneralKnowledgeExtraction {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const confidence = record.confidence === "low" || record.confidence === "medium" || record.confidence === "high"
    ? record.confidence
    : "medium";
  const outcome = record.outcome === "keep_searchable" ||
    record.outcome === "create_knowledge" ||
    record.outcome === "update_existing_knowledge"
    ? record.outcome
    : "create_knowledge";

  return {
    domain: typeof record.domain === "string" && record.domain.trim() ? record.domain.trim() : "general",
    knowledgeType:
      typeof record.knowledgeType === "string" && record.knowledgeType.trim()
        ? record.knowledgeType.trim()
        : "knowledge_note",
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : null,
    outcome,
    outcomeReason:
      typeof record.outcomeReason === "string" && record.outcomeReason.trim()
        ? record.outcomeReason.trim()
        : outcome === "keep_searchable"
          ? "This source is useful for search but is not reusable knowledge."
          : "This source contains reusable knowledge.",
    structuredData: normalizeKnowledgeStructuredData(record.structuredData),
    confidence,
  };
}
