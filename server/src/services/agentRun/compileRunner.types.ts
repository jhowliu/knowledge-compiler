import type { DraftProposalInput } from "@knowledge-compiler/agent-contracts";
import type { AgentRunner, LoopView } from "../agentLoop.js";
import type { WikiIndexer, WikiIndexingSource } from "../wikiIndexer.service.js";

type GeneralCompileExtraction = Awaited<ReturnType<WikiIndexer["extract"]>>["extraction"];

export type CompileAgentRunnerContext = {
  source: WikiIndexingSource;
  extraction: GeneralCompileExtraction;
  extractedConceptNames: string[];
  classifyOutcome(view: LoopView): Promise<{
    targetBlockId: string | null;
    conflictDetected: boolean;
  }>;
  buildDraftInput(view: LoopView, options?: { incompleteReasoning?: boolean; reason?: string }): DraftProposalInput;
};

export type CompileAgentRunnerFactory = (context: CompileAgentRunnerContext) => AgentRunner;
