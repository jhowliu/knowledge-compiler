import type { Confidence } from "./knowledge.js";

export type ExtractedConcept = {
  name: string;
  conceptType: string;
  confidence: Confidence;
};

export type KnowledgeConceptType = "topic" | "method" | "entity" | "framework" | "term";
export type KnowledgeConceptSpecificity = "generic" | "specific";

export type KnowledgeConcept = {
  name: string;
  type: KnowledgeConceptType;
  specificity: KnowledgeConceptSpecificity;
  confidence: Confidence;
};

export type KnowledgeClaim = {
  text: string;
  confidence: Confidence;
  evidenceChunkIds: string[];
};

export type KnowledgeMethod = {
  name: string;
  purpose: string;
  steps: string[];
  conditions: string[];
};

export type KnowledgeExample = {
  title: string | null;
  text: string;
  illustrates: string[];
};

export type KnowledgeConstraint = {
  text: string;
  appliesTo: string | null;
};

export type KnowledgeStructuredData = {
  summary: string;
  concepts: KnowledgeConcept[];
  claims: KnowledgeClaim[];
  methods: KnowledgeMethod[];
  examples: KnowledgeExample[];
  constraints: KnowledgeConstraint[];
};

export type KnowledgeExtraction = KnowledgeStructuredData & {
  domain: string;
  knowledgeType: string;
  title: string | null;
  confidence: Confidence;
};

const genericConceptNames = new Set([
  "algorithm",
  "algorithms",
  "array",
  "coding",
  "concept",
  "example",
  "knowledge",
  "note",
  "notes",
  "problem",
  "problem note",
  "reference",
  "source",
  "topic",
]);

export function legacyConceptType(concept: { type?: string; conceptType?: string }) {
  return concept.type ?? concept.conceptType ?? "topic";
}

export function isLinkableConcept(concept: { name?: string; specificity?: string; confidence?: string }) {
  const normalizedName = concept.name?.trim().toLowerCase();
  if (!normalizedName || genericConceptNames.has(normalizedName)) {
    return false;
  }
  if (concept.specificity === "generic" || concept.confidence === "low") {
    return false;
  }
  return true;
}

export function linkableConceptNames(concepts: Array<{ name?: string; specificity?: string; confidence?: string }>) {
  return concepts.filter(isLinkableConcept).map((concept) => concept.name?.trim()).filter((name): name is string => Boolean(name));
}

export type DecisionRule = {
  signal: string;
  recommendation: string;
  confidence: Confidence;
};

export type CodingExtraction = {
  domain: "coding";
  knowledgeType: "problem_reflection" | "general_coding_note";
  problemNumber: string | null;
  problemTitle: string | null;
  decisionRules: DecisionRule[];
  commonTraps: string[];
  patterns: string[];
  algorithms: string[];
  recognitionSignals: string[];
  keyInsights: string[];
  mistakes: string[];
  implementationDetails: string[];
  reviewActions: string[];
  concepts: ExtractedConcept[];
  confidence: Confidence;
};

export type DraftProposalItem = {
  actionType: string;
  targetType: string | null;
  payload: Record<string, unknown>;
  rationale: string;
};

export type DraftUpdateProposal = {
  detectedDomain: string;
  detectedKnowledgeType: string;
  impactLevel: number;
  confidence: Confidence;
  rationale: string;
  items: DraftProposalItem[];
};
