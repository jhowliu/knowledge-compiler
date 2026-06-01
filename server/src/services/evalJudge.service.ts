import type {
  DraftProposalInput,
  JudgeInput,
  JudgeOutput,
} from "@knowledge-compiler/agent-contracts";
import { judgeOutputSchema, validateToolOutput } from "@knowledge-compiler/agent-contracts";

export function judgeProposalHeuristically(
  input: JudgeInput,
  invalidItemIndexes: Set<number> = new Set(),
): JudgeOutput {
  const grounding: JudgeOutput["grounding"] = input.proposal.items.map((item, index) => {
    if (invalidItemIndexes.has(index)) {
      return {
        item_index: index,
        verdict: "ungrounded" as const,
        reason: "One or more source spans failed verbatim validation.",
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
