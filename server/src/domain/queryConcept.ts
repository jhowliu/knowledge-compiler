import type { Confidence } from "./knowledge.js";

export type QueryConceptCandidate = {
  text: string;
  aliases: string[];
  confidence: Confidence;
};

export type ResolvedQueryConcept = {
  conceptId: string;
  canonicalLabel: string;
  matchedText: string;
  matchedAlias: string | null;
  matchType: "canonical" | "alias";
  confidence: Confidence;
};
