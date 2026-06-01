import { query } from "../db/postgres.js";
import type { ExtractionEval } from "../domain/extractionEval.js";

type ExtractionEvalRow = {
  id: string;
  agent_run_id: string;
  source_id: string;
  verdict: "pass" | "warn" | "fail";
  coverage_score: string | number | null;
  grounding_score: string | number | null;
  warnings: unknown;
  raw_judge_output: unknown;
  created_at: Date;
};

function mapExtractionEval(row: ExtractionEvalRow): ExtractionEval {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    sourceId: row.source_id,
    verdict: row.verdict,
    coverageScore: row.coverage_score === null ? null : Number(row.coverage_score),
    groundingScore: row.grounding_score === null ? null : Number(row.grounding_score),
    warnings: row.warnings,
    rawJudgeOutput: row.raw_judge_output,
    createdAt: row.created_at,
  };
}

export interface ExtractionEvalRepository {
  create(input: {
    agentRunId: string;
    sourceId: string;
    verdict: "pass" | "warn" | "fail";
    coverageScore?: number | null;
    groundingScore?: number | null;
    warnings: unknown;
    rawJudgeOutput: unknown;
  }): Promise<ExtractionEval>;
}

export class NoopExtractionEvalRepository implements ExtractionEvalRepository {
  async create(input: {
    agentRunId: string;
    sourceId: string;
    verdict: "pass" | "warn" | "fail";
    coverageScore?: number | null;
    groundingScore?: number | null;
    warnings: unknown;
    rawJudgeOutput: unknown;
  }): Promise<ExtractionEval> {
    return {
      id: "noop-extraction-eval",
      agentRunId: input.agentRunId,
      sourceId: input.sourceId,
      verdict: input.verdict,
      coverageScore: input.coverageScore ?? null,
      groundingScore: input.groundingScore ?? null,
      warnings: input.warnings,
      rawJudgeOutput: input.rawJudgeOutput,
      createdAt: new Date(),
    };
  }
}

export class PostgresExtractionEvalRepository implements ExtractionEvalRepository {
  async create(input: {
    agentRunId: string;
    sourceId: string;
    verdict: "pass" | "warn" | "fail";
    coverageScore?: number | null;
    groundingScore?: number | null;
    warnings: unknown;
    rawJudgeOutput: unknown;
  }) {
    const result = await query<ExtractionEvalRow>(
      `
        insert into extraction_evals (
          agent_run_id,
          source_id,
          verdict,
          coverage_score,
          grounding_score,
          warnings,
          raw_judge_output
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        input.agentRunId,
        input.sourceId,
        input.verdict,
        input.coverageScore ?? null,
        input.groundingScore ?? null,
        input.warnings,
        input.rawJudgeOutput,
      ],
    );
    return mapExtractionEval(result.rows[0]);
  }
}
