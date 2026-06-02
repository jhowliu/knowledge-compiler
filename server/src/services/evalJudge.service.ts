import type {
  DraftProposalInput,
  EvalWarning,
  JudgeInput,
  JudgeOutput,
} from "@knowledge-compiler/agent-contracts";
import { judgeOutputSchema, validateToolOutput } from "@knowledge-compiler/agent-contracts";

export function judgeProposalHeuristically(
  input: JudgeInput,
  invalidItemIndexes: Set<number> = new Set(),
): JudgeOutput {
  const facetWarnings = structuredFacetGroundingWarnings(input);
  const itemsWithHighFacetWarnings = new Set(
    facetWarnings
      .filter((warning) => warning.severity === "high" && warning.affected_item_index !== null)
      .map((warning) => warning.affected_item_index as number),
  );
  const grounding: JudgeOutput["grounding"] = input.proposal.items.map((item, index) => {
    if (invalidItemIndexes.has(index)) {
      return {
        item_index: index,
        verdict: "ungrounded" as const,
        reason: "One or more source spans failed verbatim validation.",
      };
    }
    if (itemsWithHighFacetWarnings.has(index)) {
      return {
        item_index: index,
        verdict: "ungrounded" as const,
        reason: "One or more structured facets are missing valid source evidence.",
      };
    }
    return {
      item_index: index,
      verdict: item.source_spans.length > 0 ? ("grounded" as const) : ("ungrounded" as const),
      reason: item.source_spans.length > 0 ? null : "No source spans were supplied.",
    };
  });

  const conflictReview = input.proposal.items.map((item, index) => {
    const contradictionSignal =
      /\b(conflict|contradict|instead|however|but|no longer|not true)\b/i.test(item.body_markdown) ||
      /\b(conflict|contradict|instead|however|but|no longer|not true)\b/i.test(input.source_text);
    return {
      item_index: index,
      acknowledged: !contradictionSignal || item.conflict_detected,
      missed_conflict: contradictionSignal && !item.conflict_detected
        ? "Potential contradiction language was not acknowledged."
        : null,
    };
  });

  const coverageScore = input.proposal.items.length > 0 ? 0.8 : 0;
  const warnings = [
    ...grounding
      .filter((item) => item.verdict === "ungrounded")
      .map((item) => ({
        type: "ungrounded" as const,
        message: item.reason ?? "Proposal item is ungrounded.",
        severity: "high" as const,
        affected_item_index: item.item_index,
      })),
    ...facetWarnings,
    ...conflictReview
      .filter((item) => item.missed_conflict)
      .map((item) => ({
        type: "missed_conflict" as const,
        message: item.missed_conflict ?? "Missed conflict.",
        severity: "high" as const,
        affected_item_index: item.item_index,
      })),
  ];

  const hasFail =
    coverageScore < 0.5 ||
    grounding.some((item) => item.verdict === "ungrounded") ||
    facetWarnings.some((warning) => warning.severity === "high") ||
    conflictReview.some((item) => item.missed_conflict);
  const hasWarn = coverageScore < 0.7 || grounding.some((item) => item.verdict === "weak");

  return validateToolOutput(judgeOutputSchema, {
    coverage: {
      expected_concepts: [],
      missing_from_proposal: [],
      score: coverageScore,
    },
    grounding,
    conflict_review: conflictReview,
    overall_verdict: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    warnings,
    summary: warnings.length ? "Proposal needs review before approval." : "Proposal passed heuristic eval.",
  });
}

function structuredFacetGroundingWarnings(input: JudgeInput): EvalWarning[] {
  const chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]));
  const warnings: EvalWarning[] = [];

  input.proposal.items.forEach((item, itemIndex) => {
    const facets = item.structured_facets;
    if (!facets) return;

    facets.claims.forEach((claim, claimIndex) => {
      if (!claim.evidenceChunkIds.length) {
        warnings.push({
          type: "ungrounded",
          message: `Claim ${claimIndex + 1} has no evidence chunk IDs: ${claim.text}`,
          severity: "high",
          affected_item_index: itemIndex,
        });
        return;
      }

      const missingChunkIds = claim.evidenceChunkIds.filter((chunkId) => !chunksById.has(chunkId));
      if (missingChunkIds.length) {
        warnings.push({
          type: "ungrounded",
          message: `Claim ${claimIndex + 1} cites unknown source chunk IDs: ${missingChunkIds.join(", ")}`,
          severity: "high",
          affected_item_index: itemIndex,
        });
        return;
      }

      const citedText = claim.evidenceChunkIds
        .map((chunkId) => chunksById.get(chunkId)?.body_markdown ?? "")
        .join("\n")
        .toLowerCase();
      const tokens = significantTokens(claim.text);
      if (tokens.length >= 4) {
        const supportedTokens = tokens.filter((token) => citedText.includes(token));
        const coverage = supportedTokens.length / tokens.length;
        if (coverage < 0.35) {
          warnings.push({
            type: "ungrounded",
            message: `Claim ${claimIndex + 1} has weak lexical support in cited chunks: ${claim.text}`,
            severity: "high",
            affected_item_index: itemIndex,
          });
        }
      }
    });

    const materialFacetCount = facets.methods.length + facets.examples.length + facets.constraints.length;
    if (materialFacetCount > 0 && facets.claims.length === 0) {
      warnings.push({
        type: "ungrounded",
        message: "Methods, examples, or constraints were proposed without any source-backed claims.",
        severity: "high",
        affected_item_index: itemIndex,
      });
    }

    for (const suggestion of facets.inferredSuggestions) {
      if (item.body_markdown.toLowerCase().includes(suggestion.text.toLowerCase())) {
        warnings.push({
          type: "ungrounded",
          message: `Inferred suggestion leaked into approved markdown: ${suggestion.text}`,
          severity: "high",
          affected_item_index: itemIndex,
        });
      }
    }
  });

  return warnings;
}

const stopwords = new Set([
  "about",
  "after",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "from",
  "have",
  "into",
  "more",
  "must",
  "need",
  "only",
  "should",
  "than",
  "that",
  "their",
  "then",
  "there",
  "this",
  "through",
  "when",
  "where",
  "with",
  "without",
  "would",
]);

function significantTokens(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .match(/[a-z0-9_]{4,}/g)
        ?.filter((token) => !stopwords.has(token)) ?? [],
    ),
  );
}

export class EvalJudgeService {
  async judge(input: JudgeInput, invalidItemIndexes: Set<number> = new Set()) {
    return judgeProposalHeuristically(input, invalidItemIndexes);
  }
}

export function itemEvalVerdict(
  proposal: DraftProposalInput,
  judgeOutput: JudgeOutput,
  itemIndex: number,
  invalidItemIndexes: Set<number>,
): "pass" | "warn" | "fail" {
  if (invalidItemIndexes.has(itemIndex)) return "fail";
  const grounding = judgeOutput.grounding.find((item) => item.item_index === itemIndex);
  const conflict = judgeOutput.conflict_review.find((item) => item.item_index === itemIndex);
  if (grounding?.verdict === "ungrounded" || conflict?.missed_conflict) return "fail";
  if (grounding?.verdict === "weak" || proposal.incomplete_reasoning) return "warn";
  return judgeOutput.overall_verdict === "fail" ? "warn" : judgeOutput.overall_verdict;
}
