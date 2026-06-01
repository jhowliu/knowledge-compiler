import type { ExtractionEval } from "../../src/domain/extractionEval.js";
import type { ExtractionEvalRepository } from "../../src/repositories/extractionEval.repository.js";

export class InMemoryExtractionEvalRepository implements ExtractionEvalRepository {
  readonly extractionEvals: ExtractionEval[] = [];

  async create(input: {
    agentRunId: string;
    sourceId: string;
    verdict: "pass" | "warn" | "fail";
    coverageScore?: number | null;
    groundingScore?: number | null;
    warnings: unknown;
    rawJudgeOutput: unknown;
  }) {
    const extractionEval: ExtractionEval = {
      id: `extraction-eval-${this.extractionEvals.length + 1}`,
      agentRunId: input.agentRunId,
      sourceId: input.sourceId,
      verdict: input.verdict,
      coverageScore: input.coverageScore ?? null,
      groundingScore: input.groundingScore ?? null,
      warnings: input.warnings,
      rawJudgeOutput: input.rawJudgeOutput,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    };
    this.extractionEvals.push(extractionEval);
    return extractionEval;
  }

  async getByAgentRunId(agentRunId: string) {
    return [...this.extractionEvals].reverse().find((evalResult) => evalResult.agentRunId === agentRunId) ?? null;
  }
}
