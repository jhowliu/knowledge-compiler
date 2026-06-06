import { env } from "../config/env.js";
import type { QueryConceptCandidate, ResolvedQueryConcept } from "../domain/queryConcept.js";
import type { KnowledgeRepository } from "../repositories/knowledge.repository.js";

const queryConceptSchema = {
  type: "object",
  additionalProperties: false,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "aliases", "confidence"],
        properties: {
          text: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
  },
};

export type QueryConceptExtractor = {
  extract(input: { query: string }): Promise<QueryConceptCandidate[]>;
};

export type QueryConceptResolver = {
  resolve(input: { query: string }): Promise<ResolvedQueryConcept[]>;
};

export class NoopQueryConceptResolver implements QueryConceptResolver {
  async resolve(): Promise<ResolvedQueryConcept[]> {
    return [];
  }
}

export class QueryConceptResolutionService implements QueryConceptResolver {
  constructor(
    private readonly knowledgeRepository: KnowledgeRepository,
    private readonly extractor: QueryConceptExtractor = new OpenAIQueryConceptExtractor(),
  ) {}

  async resolve(input: { query: string }) {
    const query = input.query.trim();
    if (!query) {
      return [];
    }

    let candidates: QueryConceptCandidate[];
    try {
      candidates = await this.extractor.extract({ query });
    } catch {
      return [];
    }
    if (candidates.length === 0) {
      return [];
    }

    return this.knowledgeRepository.resolveQueryConcepts({ candidates, limit: 16 });
  }
}

export class OpenAIQueryConceptExtractor implements QueryConceptExtractor {
  async extract(input: { query: string }) {
    if (!env.OPENAI_API_KEY) {
      return [];
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.QUERY_CONCEPT_MODEL,
        input: [
          {
            role: "system",
            content:
              "Extract the user's retrieval query into canonical knowledge concepts and aliases. Return only concepts that should help match an existing concept graph. Include acronyms, expanded names, synonymous technical terms, API/schema field names, and common aliases when they are implied by the query. Do not answer the question and do not include generic filler words.",
          },
          {
            role: "user",
            content: input.query,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "query_concept_extraction",
            strict: true,
            schema: queryConceptSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI query concept extraction failed with ${response.status}`);
    }

    const text = outputText(await response.json());
    if (!text) {
      return [];
    }

    return normalizeQueryConcepts(JSON.parse(text));
  }
}

export function normalizeQueryConcepts(value: unknown): QueryConceptCandidate[] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const concepts = Array.isArray(record.concepts) ? record.concepts : [];
  const seen = new Set<string>();
  const normalized: QueryConceptCandidate[] = [];

  for (const concept of concepts) {
    const conceptRecord = concept && typeof concept === "object" ? (concept as Record<string, unknown>) : {};
    const text = typeof conceptRecord.text === "string" ? conceptRecord.text.trim() : "";
    if (!text) {
      continue;
    }
    const confidence =
      conceptRecord.confidence === "low" ||
      conceptRecord.confidence === "medium" ||
      conceptRecord.confidence === "high"
        ? conceptRecord.confidence
        : "medium";
    const aliases = Array.isArray(conceptRecord.aliases)
      ? conceptRecord.aliases
          .filter((alias): alias is string => typeof alias === "string")
          .map((alias) => alias.trim())
          .filter(Boolean)
      : [];
    const key = [text, ...aliases].join("|").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ text, aliases, confidence });
  }

  return normalized;
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
