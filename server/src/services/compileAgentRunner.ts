/**
 * LLM-backed compile runner (#107, Part B — P2).
 *
 * Implements the {@link AgentRunner} contract consumed by {@link runAgentLoop}:
 * each round the model is shown the running transcript and the tools that are
 * *currently legal* (the harness owns dynamic exposure / caps / terminal rules),
 * and it chooses exactly one tool to call next. Unlike the scripted runner, the
 * model authors the `draft_proposal` payload itself from its observations; the
 * harness only validates (Zod) and persists it.
 *
 * The model call is behind an injectable {@link CompileModelClient} seam so the
 * runner can be unit-tested deterministically without hitting the network. The
 * default client talks to the OpenAI Responses API with function tools.
 */
import { z } from "zod";
import {
  draftProposalInputSchema,
  getBlockHistoryInputSchema,
  getBlockInputSchema,
  getSourceInputSchema,
  lookupConceptsInputSchema,
  searchBlocksInputSchema,
} from "@knowledge-compiler/agent-contracts";
import { env } from "../config/env.js";
import type { AgentRunner, LoopTranscriptEntry, LoopView } from "./agentLoop.js";
import type { CompileAgentRunnerContext } from "./agentRunQueue.service.js";

export type CompileToolSpec = {
  /** Tool name the model must echo back when it decides to call it. */
  name: string;
  description: string;
  /** JSON Schema for the tool arguments (guidance, not a hard gate — the loop
   * re-validates with Zod and feeds errors back for the model to correct). */
  parameters: Record<string, unknown>;
};

export type CompileModelRequest = {
  model: string;
  /** System prompt: the editor role, protocol, and decision rules. */
  instructions: string;
  /** User content: source context + running transcript + the round's choices. */
  input: string;
  /** Only the tools legal this round, exposed as callable functions. */
  tools: CompileToolSpec[];
};

export type CompileModelResponse = {
  toolName: string;
  arguments: unknown;
};

export type CompileModelClient = (request: CompileModelRequest) => Promise<CompileModelResponse>;

export type LlmCompileRunnerDeps = {
  /** Override the model call (default = OpenAI Responses API). */
  modelClient?: CompileModelClient;
  /** Override the model id (default = {@link env.COMPILE_AGENT_MODEL}). */
  model?: string;
};

/** Per-tool argument JSON Schemas, derived from the shared agent contracts so
 * they cannot drift from what the loop actually validates. */
const toolParameterSchemas: Record<string, z.ZodTypeAny> = {
  get_source: getSourceInputSchema,
  search_blocks: searchBlocksInputSchema,
  get_block: getBlockInputSchema,
  lookup_concepts: lookupConceptsInputSchema,
  get_block_history: getBlockHistoryInputSchema,
  draft_proposal: draftProposalInputSchema,
};

const toolDescriptions: Record<string, string> = {
  get_source:
    "Fetch the full raw source text and its chunks (with chunk ids). Call this first when a source id exists so later draft_proposal spans can cite real chunks.",
  search_blocks:
    "Search the existing knowledge base for blocks related to this source. Always do this before drafting so the keep/create/update decision is made after seeing what already exists.",
  lookup_concepts:
    "Resolve the source's concept names against the concept index, returning canonical ids and any knowledge blocks already linked to them.",
  get_block:
    "Read the full body, evidence and links of one knowledge block surfaced by a prior search/lookup. Use it before deciding to update or merge into an existing block.",
  get_block_history:
    "Read the version history of a block to understand how it has changed before proposing a conflicting revision.",
  draft_proposal:
    "Terminal. Submit the final proposal you authored from your observations. Allowed only after get_source (when a source id exists) and search_blocks have run. Call it exactly once.",
  finish_without_proposal:
    "Terminal. Bail out cleanly when you cannot responsibly draft a proposal; the source is kept searchable and the run is marked incomplete_reasoning.",
};

const finishWithoutProposalSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    reason: {
      type: "string",
      description: "Why a complete proposal could not be drafted.",
    },
  },
  required: [],
};

function parametersForTool(name: string): Record<string, unknown> {
  if (name === "finish_without_proposal") {
    return finishWithoutProposalSchema;
  }
  const schema = toolParameterSchemas[name];
  if (!schema) {
    return { type: "object", additionalProperties: true, properties: {} };
  }
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

const maxOutputChars = 2400;
const maxSourcePreviewChars = 4000;

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…(truncated ${value.length - max} chars)`;
}

function renderToolResult(entry: LoopTranscriptEntry) {
  if (!entry.result.ok) {
    return `ERROR: ${entry.result.error}`;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(entry.result.output);
  } catch {
    serialized = String(entry.result.output);
  }
  return truncate(serialized ?? "null", maxOutputChars);
}

function renderTranscript(transcript: ReadonlyArray<LoopTranscriptEntry>) {
  if (transcript.length === 0) {
    return "No tools have run yet.";
  }
  return transcript
    .map((entry) => {
      let input: string;
      try {
        input = JSON.stringify(entry.input);
      } catch {
        input = String(entry.input);
      }
      return `[round ${entry.round}] ${entry.tool}(${truncate(input, 600)}) =>\n${renderToolResult(entry)}`;
    })
    .join("\n\n");
}

function buildInstructions() {
  return [
    "You are the LLM wiki editor compiling a raw source into the knowledge base.",
    "Work as a ReAct loop: think, then call exactly ONE of the tools offered this round, observe its result, and continue. Only the tools listed as available may be called.",
    "",
    "Protocol you must follow:",
    "- When a source id is provided, call get_source before anything else so you can cite real chunk ids later.",
    "- Always call search_blocks (and usually lookup_concepts) before drafting; the keep/create/update decision must be made AFTER seeing the existing knowledge base.",
    "- Only read blocks (get_block / get_block_history) whose ids appeared in a prior tool result.",
    "- Finish by calling draft_proposal exactly once, or finish_without_proposal if you genuinely cannot draft responsibly. Nothing runs after a terminal tool.",
    "",
    "Decide the per-item action by meaning, not keywords, applying the same rules in any language:",
    "- keep_source_searchable when the source is not reusable knowledge (interview drafts, self-introductions, pitches, meeting notes, TODOs, one-off personal artifacts).",
    "- upsert_knowledge when the source teaches reusable knowledge. To update an existing block instead of duplicating it, set target_block_id to a block id you saw; prefer updating over creating a near-duplicate.",
    "- Set conflict_detected true only when the source genuinely contradicts the targeted block, and then provide conflict_summary and conflict_resolution.",
    "",
    "draft_proposal authoring rules:",
    "- Ground every item in the source: source_spans must be VERBATIM substrings of a chunk's body_markdown, with correct chunk_index/char_start/char_end (non-verbatim spans are flagged as ungrounded by the eval lint).",
    "- Cite chunk ids you saw in get_source/search results; do not invent ids.",
    "- Do not add facts, steps, or conclusions that are not supported by the source text.",
    "- If a tool returns a validation error, read it, correct your arguments, and call the tool again.",
    "Respond only by calling a tool.",
  ].join("\n");
}

function buildInput(context: CompileAgentRunnerContext, view: LoopView) {
  const { source, extraction, extractedConceptNames } = context;
  const lines = [
    `Source role: ${source.sourceRole}`,
    `Source type: ${source.sourceType}`,
    `Title: ${source.title ?? "Untitled"}`,
    `Topics: ${(source.topicNames ?? []).join(", ") || "none"}`,
    `Raw source id: ${source.rawSourceId ?? "none"}`,
    `Raw note id: ${source.rawNoteId ?? "none"}`,
    "",
    `Provisional outcome from extraction: ${extraction.outcome}`,
    `Provisional reason: ${extraction.outcomeReason}`,
    `Extraction summary: ${extraction.structuredData.summary}`,
    `Extracted concepts: ${extractedConceptNames.join(", ") || "none"}`,
    "",
    "Source preview:",
    truncate(source.bodyMarkdown, maxSourcePreviewChars),
    "",
    `Round ${view.round}. Tools so far and what they returned:`,
    renderTranscript(view.transcript),
    "",
    `Available tools this round: ${view.availableTools.join(", ")}`,
    "Call exactly one of the available tools now.",
  ];
  return lines.join("\n");
}

function extractText(response: unknown) {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return null;
}

function parseFunctionCall(response: unknown): CompileModelResponse {
  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (candidate.type !== "function_call") continue;
    const name = typeof candidate.name === "string" ? candidate.name : null;
    if (!name) continue;
    return { toolName: name, arguments: parseArguments(candidate.arguments) };
  }
  // Some responses nest a function_call inside message content parts.
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as Record<string, unknown>).type === "function_call") {
        const candidate = part as Record<string, unknown>;
        const name = typeof candidate.name === "string" ? candidate.name : null;
        if (name) return { toolName: name, arguments: parseArguments(candidate.arguments) };
      }
    }
  }
  const text = extractText(response);
  throw new Error(
    `Compile model did not return a tool call${text ? `; got text instead: ${truncate(text, 200)}` : ""}`,
  );
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function createOpenAiModelClient(): CompileModelClient {
  return async (request) => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for the LLM compile runner");
    }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        tools: request.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: false,
        })),
        tool_choice: "required",
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI compile runner request failed with ${response.status}`);
    }
    return parseFunctionCall(await response.json());
  };
}

/**
 * Build an {@link AgentRunner} that drives the compile loop with a real LLM.
 * The loop driver still owns every guarantee (legal tools, caps, terminal
 * handling, span verification); this runner only chooses the next step.
 */
export function createLlmCompileAgentRunner(
  context: CompileAgentRunnerContext,
  deps: LlmCompileRunnerDeps = {},
): AgentRunner {
  const modelClient = deps.modelClient ?? createOpenAiModelClient();
  const model = deps.model ?? env.COMPILE_AGENT_MODEL;
  const instructions = buildInstructions();

  return {
    async nextStep(view) {
      const tools: CompileToolSpec[] = view.availableTools.map((name) => ({
        name,
        description: toolDescriptions[name] ?? `Call the ${name} tool.`,
        parameters: parametersForTool(name),
      }));
      const result = await modelClient({
        model,
        instructions,
        input: buildInput(context, view),
        tools,
      });
      return { tool: result.toolName, input: result.arguments };
    },
  };
}
