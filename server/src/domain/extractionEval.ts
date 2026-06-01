export type ExtractionEval = {
  id: string;
  agentRunId: string;
  sourceId: string;
  verdict: "pass" | "warn" | "fail";
  coverageScore: number | null;
  groundingScore: number | null;
  warnings: unknown;
  rawJudgeOutput: unknown;
  createdAt: Date;
};
