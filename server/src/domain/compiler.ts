import type { Confidence } from "./knowledge.js";

export type ExtractedConcept = {
  name: string;
  conceptType: string;
  confidence: Confidence;
};

export type KnowledgeConceptFacet = {
  name: string;
  type: "topic" | "method" | "entity" | "framework" | "term";
  specificity: "generic" | "specific";
  confidence: Confidence;
};

export type KnowledgeClaimFacet = {
  text: string;
  confidence: Confidence;
  evidenceChunkIds: string[];
};

export type KnowledgeMethodFacet = {
  name: string;
  purpose: string;
  steps: string[];
  conditions: string[];
};

export type KnowledgeExampleFacet = {
  title: string | null;
  text: string;
  illustrates: string[];
};

export type KnowledgeConstraintFacet = {
  text: string;
  appliesTo: string | null;
};

export type KnowledgeInferredSuggestion = {
  text: string;
  reason: string;
  confidence: Confidence;
};

export type KnowledgeStructuredData = {
  summary: string;
  concepts: KnowledgeConceptFacet[];
  claims: KnowledgeClaimFacet[];
  methods: KnowledgeMethodFacet[];
  examples: KnowledgeExampleFacet[];
  constraints: KnowledgeConstraintFacet[];
  inferredSuggestions: KnowledgeInferredSuggestion[];
  rawSourceId?: string | null;
  rawNoteId?: string | null;
  sourceRole?: string;
  sourceType?: string;
  sourceChunks?: Array<{
    id: string;
    chunkIndex: number;
    heading: string | null;
    tokenEstimate: number;
  }>;
};

export type GeneralKnowledgeExtraction = {
  domain: string;
  knowledgeType: string;
  title: string | null;
  outcome: IndexingOutcome;
  outcomeReason: string;
  structuredData: KnowledgeStructuredData;
  confidence: Confidence;
};

export type IndexingOutcome =
  | "keep_searchable"
  | "create_knowledge"
  | "update_existing_knowledge";

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
  sourceSpans?: unknown;
  conflictDetected?: boolean;
  conflictSummary?: string | null;
  conflictResolution?: string | null;
  evalVerdict?: "pass" | "warn" | "fail" | null;
  evalWarnings?: unknown;
  incompleteReasoning?: boolean;
};

export type DraftUpdateProposal = {
  detectedDomain: string;
  detectedKnowledgeType: string;
  impactLevel: number;
  confidence: Confidence;
  rationale: string;
  items: DraftProposalItem[];
};
