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
  const preservationWarnings = targetedPreservationWarnings(input);
  const preservationWarningByItem = new Map(
    preservationWarnings
      .filter((warning) => warning.affected_item_index !== null)
      .map((warning) => [warning.affected_item_index as number, warning.message]),
  );
  const result = runGroundingChecks(groundingChunks(input), input.proposal.items);

  const grounding: JudgeOutput["grounding"] = result.items.map((item) => ({
    item_index: item.item_index,
    verdict: item.ok && !preservationWarningByItem.has(item.item_index)
      ? ("grounded" as const)
      : ("ungrounded" as const),
    reason: item.ok
      ? preservationWarningByItem.get(item.item_index) ?? null
      : item.failures.map((failure) => failure.detail).join(" "),
  }));

  const warnings: EvalWarning[] = [
    ...result.items.flatMap((item) =>
      item.failures.map((failure) => ({
        type: "ungrounded" as const,
        message: groundingWarningMessage(failure),
        severity: "high" as const,
        affected_item_index: item.item_index,
      })),
    ),
    ...preservationWarnings,
  ];

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
    overall_verdict: result.ok && preservationWarnings.length === 0 ? "pass" : "fail",
    summary: result.ok && preservationWarnings.length === 0
      ? "Proposal passed grounding checks."
      : "Proposal needs review before approval.",
    warnings,
  });
}

function groundingWarningMessage(failure: GroundingFailure): string {
  switch (failure.check) {
    case "missing_evidence":
      return `Claim has no evidence IDs: ${failure.claim_text ?? ""}`.trim();
    case "unknown_chunk_id":
      return `Claim cites unknown evidence IDs: ${failure.chunk_id ?? ""}`.trim();
    case "inferred_suggestion_leak":
      return `Inferred suggestion leaked into approved markdown: ${failure.suggestion_text ?? ""}`.trim();
    case "verbatim_span":
    default:
      return failure.detail;
  }
}

function groundingChunks(input: JudgeInput) {
  const chunks = input.chunks.map((chunk) => ({
    id: chunk.id,
    chunk_index: chunk.chunk_index,
    body_markdown: chunk.body_markdown,
  }));
  const nextChunkIndex = chunks.reduce((max, chunk) => Math.max(max, chunk.chunk_index), -1) + 1;
  const approvedBlockChunks = input.existing_blocks_context
    .filter((block) => block.body_markdown?.trim())
    .map((block, index) => ({
      id: block.block_id,
      chunk_index: nextChunkIndex + index,
      body_markdown: block.body_markdown!,
    }));
  return [...chunks, ...approvedBlockChunks];
}

function targetedPreservationWarnings(input: JudgeInput): EvalWarning[] {
  const warnings: EvalWarning[] = [];
  input.proposal.items.forEach((item, itemIndex) => {
    const targetBlock = item.target_block_id
      ? input.existing_blocks_context.find((block) => block.block_id === item.target_block_id) ?? null
      : null;
    if (
      item.target_block_id &&
      targetBlock?.body_markdown &&
      !item.conflict_detected &&
      !meaningfullyPreserves(item.body_markdown, targetBlock.body_markdown)
    ) {
      warnings.push({
        type: "ungrounded",
        message: `Targeted update does not preserve enough of approved block ${item.target_block_id}; submit the complete merged knowledge body, not only the new source delta.`,
        severity: "high",
        affected_item_index: itemIndex,
      });
    }
  });
  return warnings;
}

function meaningfullyPreserves(candidateBody: string, approvedBody: string) {
  const approvedTokens = significantTokens(approvedBody);
  if (approvedTokens.length < 8) {
    return normalizeText(candidateBody).includes(normalizeText(approvedBody));
  }
  const candidate = normalizeText(candidateBody);
  const preserved = approvedTokens.filter((token) => candidate.includes(token));
  return preserved.length / approvedTokens.length >= 0.45;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9_]+/g, " ").trim().replace(/\s+/g, " ");
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
