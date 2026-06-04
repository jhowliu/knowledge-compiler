/**
 * Standalone agent link judge (#98 option A).
 *
 * Both automatic link triggers converge on one judgment mechanism: the compile
 * loop expresses it inline (draft_proposal.suggested_links), and the
 * reindex_links backfill uses this judge to evaluate candidate note pairs.
 * Candidate generation stays deterministic upstream; this only decides, per
 * pair, whether a link should exist and with what relation/confidence/evidence.
 *
 * The model call is behind an injectable seam so reindex can be unit-tested
 * deterministically without hitting the network.
 */
import { z } from "zod";
import { Agent, run, tool, type AgentOutputType, type RunResult } from "@openai/agents";
import { linkJudgmentSchema, type LinkJudgment } from "@knowledge-compiler/agent-contracts";
import { env } from "../../config/env.js";

type SdkToolParameters = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: true;
};

function sdkToolParameters(schema: Record<string, unknown>): SdkToolParameters {
  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : Object.keys(properties);
  return { ...schema, type: "object", properties, required, additionalProperties: true };
}

export type LinkCandidateNote = {
  id: string;
  title: string;
  noteType: string;
  bodyMarkdown: string;
};

export type LinkCandidate = {
  source: LinkCandidateNote;
  target: LinkCandidateNote;
};

export type LinkJudge = (candidate: LinkCandidate) => Promise<LinkJudgment>;
export type LinkJudgeFactory = () => LinkJudge;

type JudgeAgent = Agent<unknown, AgentOutputType>;
export type LinkJudgeAgentRun = (
  agent: JudgeAgent,
  input: string,
  options: { maxTurns: number },
) => Promise<Pick<RunResult<unknown, JudgeAgent>, "finalOutput">>;

export type LinkJudgeDeps = {
  model?: string;
  agentRun?: LinkJudgeAgentRun;
};

const maxBodyChars = 1800;

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function buildInstructions() {
  return [
    "You decide whether two existing knowledge notes should be linked in a knowledge graph.",
    "Link only when there is a genuine semantic relationship — shared keywords or topical overlap alone is NOT enough.",
    "Pick the most specific relation_type: supports, contrasts, example_of, prerequisite, or related_concept.",
    "Set should_link false when they are merely adjacent or unrelated.",
    "Use confidence low for weak/uncertain judgments (these are dropped); reserve medium/high for clear relationships.",
    "Ground your decision: give a concrete rationale and verbatim source_evidence/target_evidence snippets from the two notes.",
    "Respond by calling submit_link_judgment exactly once.",
  ].join("\n");
}

function renderCandidate(candidate: LinkCandidate) {
  const note = (label: string, n: LinkCandidateNote) =>
    [`${label} (${n.noteType}): ${n.title}`, truncate(n.bodyMarkdown, maxBodyChars)].join("\n");
  return [note("SOURCE note", candidate.source), "", note("TARGET note", candidate.target)].join("\n");
}

function parseJudgment(value: unknown): LinkJudgment {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return linkJudgmentSchema.parse(parsed);
}

export function createLlmLinkJudge(deps: LinkJudgeDeps = {}): LinkJudge {
  const model = deps.model ?? env.COMPILE_AGENT_MODEL;
  const agentRun = deps.agentRun ?? (run as LinkJudgeAgentRun);
  const instructions = buildInstructions();
  const parameters = sdkToolParameters(z.toJSONSchema(linkJudgmentSchema) as Record<string, unknown>);

  return async (candidate) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for the LLM link judge");
    }
    const judgeTool = tool<SdkToolParameters, unknown, string>({
      name: "submit_link_judgment",
      description: "Submit the relationship judgment for the two notes.",
      parameters,
      strict: false,
      execute: async (input: unknown) => JSON.stringify(input ?? {}),
    });
    const agent = new Agent({
      name: "Knowledge link judge",
      instructions,
      model,
      tools: [judgeTool],
      toolUseBehavior: "stop_on_first_tool",
      modelSettings: { toolChoice: "required" },
    });
    const result = await agentRun(agent, renderCandidate(candidate), { maxTurns: 1 });
    return parseJudgment(result.finalOutput);
  };
}
