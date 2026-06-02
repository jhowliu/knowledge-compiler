import type {
  KnowledgeConceptFacet,
  KnowledgeConstraintFacet,
  KnowledgeExampleFacet,
  KnowledgeMethodFacet,
  KnowledgeStructuredData,
} from "../domain/compiler.js";
import type { Confidence } from "../domain/knowledge.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

function confidenceValue(value: unknown, fallback: Confidence = "medium"): Confidence {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function conceptTypeValue(value: unknown): KnowledgeConceptFacet["type"] {
  return value === "topic" ||
    value === "method" ||
    value === "entity" ||
    value === "framework" ||
    value === "term"
    ? value
    : "term";
}

function specificityValue(value: unknown): KnowledgeConceptFacet["specificity"] {
  return value === "generic" || value === "specific" ? value : "specific";
}

export function normalizeKnowledgeStructuredData(value: unknown): KnowledgeStructuredData {
  const record = asRecord(value);
  return {
    summary: stringValue(record.summary),
    concepts: normalizeConcepts(record.concepts),
    claims: normalizeClaims(record.claims),
    methods: normalizeMethods(record.methods),
    examples: normalizeExamples(record.examples),
    constraints: normalizeConstraints(record.constraints),
    rawSourceId: typeof record.rawSourceId === "string" ? record.rawSourceId : null,
    rawNoteId: typeof record.rawNoteId === "string" ? record.rawNoteId : null,
    sourceRole: typeof record.sourceRole === "string" ? record.sourceRole : undefined,
    sourceType: typeof record.sourceType === "string" ? record.sourceType : undefined,
    sourceChunks: normalizeSourceChunks(record.sourceChunks),
  };
}

export function hasKnowledgeFacets(value: unknown) {
  const facets = normalizeKnowledgeStructuredData(value);
  return Boolean(
    facets.summary ||
      facets.concepts.length ||
      facets.claims.length ||
      facets.methods.length ||
      facets.examples.length ||
      facets.constraints.length,
  );
}

export function renderKnowledgeFacetsMarkdown(value: unknown, fallback = "") {
  const facets = normalizeKnowledgeStructuredData(value);
  const sections = [
    facets.summary ? `## Summary\n${facets.summary}` : "",
    listSection(
      "Concepts",
      facets.concepts.map((concept) =>
        [
          concept.name,
          concept.type ? `type: ${concept.type}` : null,
          concept.specificity ? `specificity: ${concept.specificity}` : null,
        ]
          .filter(Boolean)
          .join(" - "),
      ),
    ),
    listSection("Claims", facets.claims.map((claim) => claim.text)),
    methodsSection(facets.methods),
    examplesSection(facets.examples),
    listSection("Constraints / Caveats", facets.constraints.map((constraint) =>
      constraint.appliesTo ? `${constraint.text} (applies to: ${constraint.appliesTo})` : constraint.text,
    )),
  ].filter(Boolean);

  return sections.length ? sections.join("\n\n") : fallback;
}

function normalizeConcepts(value: unknown): KnowledgeConceptFacet[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      const name = stringValue(record.name);
      return name
        ? {
            name,
            type: conceptTypeValue(record.type ?? record.conceptType),
            specificity: specificityValue(record.specificity),
            confidence: confidenceValue(record.confidence),
          }
        : null;
    })
    .filter((item): item is KnowledgeConceptFacet => Boolean(item));
}

function normalizeClaims(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      const text = stringValue(record.text);
      return text
        ? {
            text,
            confidence: confidenceValue(record.confidence),
            evidenceChunkIds: stringArray(record.evidenceChunkIds),
          }
        : null;
    })
    .filter((item): item is KnowledgeStructuredData["claims"][number] => Boolean(item));
}

function normalizeMethods(value: unknown): KnowledgeMethodFacet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
      const record = asRecord(item);
      const name = stringValue(record.name);
      const purpose = stringValue(record.purpose);
      return name || purpose
        ? [{
            name: name || "Method",
            purpose,
            steps: stringArray(record.steps),
            conditions: stringArray(record.conditions),
          }]
        : [];
    });
}

function normalizeExamples(value: unknown): KnowledgeExampleFacet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
      const record = asRecord(item);
      const text = stringValue(record.text);
      return text
        ? [{
            title: stringValue(record.title) || null,
            text,
            illustrates: stringArray(record.illustrates),
          }]
        : [];
    });
}

function normalizeConstraints(value: unknown): KnowledgeConstraintFacet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
      const record = asRecord(item);
      const text = stringValue(record.text);
      return text
        ? [{
            text,
            appliesTo: stringValue(record.appliesTo) || null,
          }]
        : [];
    });
}

function normalizeSourceChunks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      return typeof record.id === "string" && typeof record.chunkIndex === "number"
        ? {
            id: record.id,
            chunkIndex: record.chunkIndex,
            heading: typeof record.heading === "string" ? record.heading : null,
            tokenEstimate: typeof record.tokenEstimate === "number" ? record.tokenEstimate : 0,
          }
        : null;
    })
    .filter((item): item is NonNullable<KnowledgeStructuredData["sourceChunks"]>[number] => Boolean(item));
}

function listSection(title: string, lines: string[]) {
  const cleanLines = lines.map((line) => line.trim()).filter(Boolean);
  return cleanLines.length ? [`## ${title}`, ...cleanLines.map((line) => `- ${line}`)].join("\n") : "";
}

function methodsSection(methods: KnowledgeMethodFacet[]) {
  if (!methods.length) return "";
  return [
    "## Methods",
    ...methods.map((method) => {
      const lines = [`### ${method.name}`];
      if (method.purpose) lines.push(method.purpose);
      if (method.conditions?.length) {
        lines.push("Conditions:");
        lines.push(...method.conditions.map((condition) => `- ${condition}`));
      }
      if (method.steps?.length) {
        lines.push("Steps:");
        lines.push(...method.steps.map((step, index) => `${index + 1}. ${step}`));
      }
      return lines.join("\n");
    }),
  ].join("\n\n");
}

function examplesSection(examples: KnowledgeExampleFacet[]) {
  if (!examples.length) return "";
  return [
    "## Examples",
    ...examples.map((example) => {
      const lines = example.title ? [`### ${example.title}`] : [];
      lines.push(example.text);
      if (example.illustrates.length) {
        lines.push(`Illustrates: ${example.illustrates.join(", ")}`);
      }
      return lines.join("\n");
    }),
  ].join("\n\n");
}
