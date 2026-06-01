import type { Confidence } from "./knowledge.js";

export type ExtractedConcept = {
  name: string;
  conceptType: string;
  confidence: Confidence;
};

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
