import type {
  DraftProposalInput,
  EvalWarning,
  GroundingFailure,
  JudgeInput,
  JudgeOutput,
} from "@knowledge-compiler/agent-contracts";
import { judgeOutputSchema, runGroundingChecks, validateToolOutput } from "@knowledge-compiler/agent-contracts";

/**
 * Deterministic grounding lint. Runs only the exact, ungameable hard checks
 * (verbatim spans, evidence presence, chunk-id existence, inferred-suggestion
 * leakage) via the shared {@link runGroundingChecks}. Semantic support of
 * paraphrases / cross-language rewrites is NOT judged here — that is the LLM
 * judge's job (issue #129). The previous pseudo-semantic heuristics
 * (lexical-overlap, "has spans ⇒ grounded", "facets without claims") were
 * removed because they false-fail legitimate paraphrases.
 */
export function judgeProposalHeuristically(input: JudgeInput): JudgeOutput {
  const result = runGroundingChecks(input.chunks, input.proposal.items);

  const grounding: JudgeOutput["grounding"] = result.items.map((item) => ({
    item_index: item.item_index,
    verdict: item.ok ? ("grounded" as const) : ("ungrounded" as const),
    reason: item.ok ? null : item.failures.map((failure) => failure.detail).join(" "),
  }));

  const warnings: EvalWarning[] = result.items.flatMap((item) =>
    item.failures.map((failure) => ({
      type: "ungrounded" as const,
      message: groundingWarningMessage(failure),
      severity: "high" as const,
      affected_item_index: item.item_index,
    })),
  );

  // Conflict is decided by the LLM (classifyOutcome, #105); the deterministic
  // lint does not re-judge it with a keyword heuristic.
  const conflictReview = input.proposal.items.map((_item, index) => ({
    item_index: index,
    acknowledged: true,
    missed_conflict: null,
  }));

  return validateToolOutput(judgeOutputSchema, {
    // Coverage (under-extraction) is not measured by the deterministic lint.
    coverage: {
      expected_concepts: [],
      missing_from_proposal: [],
      score: null,
    },
    grounding,
    conflict_review: conflictReview,
    overall_verdict: result.ok ? "pass" : "fail",
    summary: result.ok
      ? "Proposal passed grounding checks."
      : "Proposal needs review before approval.",
    warnings,
  });
}

function groundingWarningMessage(failure: GroundingFailure): string {
  switch (failure.check) {
    case "missing_evidence":
      return `Claim has no evidence chunk IDs: ${failure.claim_text ?? ""}`.trim();
    case "unknown_chunk_id":
      return `Claim cites unknown source chunk IDs: ${failure.chunk_id ?? ""}`.trim();
    case "inferred_suggestion_leak":
      return `Inferred suggestion leaked into approved markdown: ${failure.suggestion_text ?? ""}`.trim();
    case "verbatim_span":
    default:
      return failure.detail;
  }
}

export class EvalJudgeService {
  // invalidItemIndexes is accepted for call-site compatibility but no longer
  // needed: runGroundingChecks performs the verbatim-span check internally.
  async judge(input: JudgeInput, _invalidItemIndexes: Set<number> = new Set()) {
    return judgeProposalHeuristically(input);
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
  if (grounding?.verdict === "ungrounded") return "fail";
  if (grounding?.verdict === "weak" || proposal.incomplete_reasoning) return "warn";
  return judgeOutput.overall_verdict === "fail" ? "warn" : judgeOutput.overall_verdict;
}
