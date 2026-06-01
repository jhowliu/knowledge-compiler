import { toolContractVersion } from "@knowledge-compiler/agent-contracts";
import { env } from "../config/env.js";

export const indexerPromptVersion = "1.0.0";
export const judgePromptVersion = "1.0.0";

export function compileRunMetadata() {
  return {
    indexer_prompt_version: indexerPromptVersion,
    judge_prompt_version: judgePromptVersion,
    tool_contract_version: toolContractVersion,
    model: env.INDEXER_MODEL,
    judge_model: env.EVAL_JUDGE_MODEL,
  };
}
