import {
  createLlmCompileAgentRunner,
  type AgentsSdkRun,
  type CompileModelClient,
  type CompileModelRequest,
} from "../src/services/compileAgentRunner.js";
import type { CompileAgentRunnerContext } from "../src/services/agentRunQueue.service.js";
import type { LoopView } from "../src/services/agentLoop.js";
import type { GeneralKnowledgeExtraction } from "../src/domain/compiler.js";
import type { WikiIndexingSource } from "../src/services/wikiIndexer.service.js";
import type { DraftProposalInput } from "@knowledge-compiler/agent-contracts";

const extraction: GeneralKnowledgeExtraction = {
  domain: "general",
  knowledgeType: "knowledge_note",
  title: "Bounded Graph State",
  outcome: "create_knowledge",
  outcomeReason: "Teaches a reusable graph technique.",
  structuredData: {
    summary: "Track bounded state in graph search.",
    concepts: [],
    claims: [],
    methods: [],
    examples: [],
    constraints: [],
    inferredSuggestions: [],
  },
  confidence: "high",
};

const source: WikiIndexingSource = {
  id: "raw-source-1",
  rawNoteId: "raw-note-1",
  rawSourceId: "raw-source-1",
  userId: "user-1",
  sourceRole: "reference",
  sourceType: "markdown",
  title: "Graph state",
  bodyMarkdown: "Track remaining stops as part of the distance state.",
  topicNames: ["graphs"],
  chunks: [],
};

function makeContext(): CompileAgentRunnerContext {
  return {
    source,
    extraction,
    extractedConceptNames: ["Bounded Graph State"],
    async classifyOutcome() {
      return { targetBlockId: null, conflictDetected: false };
    },
    buildDraftInput() {
      throw new Error("buildDraftInput should not be called by the LLM runner");
    },
  };
}

function view(partial: Partial<LoopView> = {}): LoopView {
  return {
    round: 1,
    availableTools: ["get_source", "search_blocks"],
    transcript: [],
    ...partial,
  };
}

test("exposes only the tools available this round to the model", async () => {
  let captured: CompileModelRequest | null = null;
  const modelClient: CompileModelClient = async (request) => {
    captured = request;
    return { toolName: "get_source", arguments: { source_id: "raw-source-1" } };
  };
  const runner = createLlmCompileAgentRunner(makeContext(), { modelClient });

  const step = await runner.nextStep(view({ availableTools: ["get_source", "lookup_concepts"] }));

  expect(step).toEqual({ tool: "get_source", input: { source_id: "raw-source-1" } });
  expect(captured!.tools.map((tool) => tool.name)).toEqual(["get_source", "lookup_concepts"]);
  // Schemas are derived from the shared contracts, so the model sees real params.
  const getSource = captured!.tools.find((tool) => tool.name === "get_source");
  expect(getSource?.parameters).toMatchObject({
    type: "object",
    properties: { source_id: expect.anything() },
  });
});

test("renders the running transcript so the model can author from observations", async () => {
  let captured: CompileModelRequest | null = null;
  const modelClient: CompileModelClient = async (request) => {
    captured = request;
    return { toolName: "draft_proposal", arguments: {} };
  };
  const runner = createLlmCompileAgentRunner(makeContext(), { modelClient });

  await runner.nextStep(
    view({
      round: 3,
      availableTools: ["draft_proposal"],
      transcript: [
        { round: 1, tool: "get_source", input: { source_id: "raw-source-1" }, result: { ok: true, output: { chunks: [{ id: "c0" }] } } },
        { round: 2, tool: "search_blocks", input: { query: "graph" }, result: { ok: true, output: { results: [{ block_id: "b1" }] } } },
      ],
    }),
  );

  expect(captured!.input).toContain("get_source");
  expect(captured!.input).toContain("search_blocks");
  expect(captured!.input).toContain("b1");
  expect(captured!.input).toContain("Available tools this round: draft_proposal");
});

test("passes a model-authored draft_proposal payload straight through", async () => {
  const draft: DraftProposalInput = {
    indexing_outcome: "create_knowledge",
    outcome_reason: "Reusable knowledge.",
    reasoning_summary: "Authored from observations.",
    incomplete_reasoning: false,
    items: [
      {
        action: "upsert_knowledge",
        target_block_id: null,
        title: "Bounded Graph State",
        body_markdown: "Track bounded state.",
        source_concept_ids: [],
        source_spans: [{ chunk_index: 0, char_start: 0, char_end: 5, text: "Track" }],
        confidence: "high",
        conflict_detected: false,
        conflict_summary: null,
        conflict_resolution: null,
      },
    ],
    suggested_links: [],
  };
  const modelClient: CompileModelClient = async () => ({ toolName: "draft_proposal", arguments: draft });
  const runner = createLlmCompileAgentRunner(makeContext(), { modelClient });

  const step = await runner.nextStep(view({ availableTools: ["draft_proposal"] }));

  expect(step.tool).toBe("draft_proposal");
  expect(step.input).toEqual(draft);
});

test("default client uses the Agents SDK as a single-tool policy and parses the call", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let capturedAgent: { model: unknown; tools: Array<{ name: string }>; toolUseBehavior: unknown } | null = null;
  let capturedInput = "";
  let capturedOptions: { maxTurns?: number } | null = null;
  const agentRun: AgentsSdkRun = async (agent, input, options) => {
    capturedAgent = {
      model: agent.model,
      tools: agent.tools.map((agentTool) => ({ name: agentTool.name })),
      toolUseBehavior: agent.toolUseBehavior,
    };
    capturedInput = input;
    capturedOptions = options;
    return {
      finalOutput: JSON.stringify({
        toolName: "search_blocks",
        arguments: { query: "graph state", limit: 8 },
      }),
    } as Awaited<ReturnType<AgentsSdkRun>>;
  };

  try {
    const runner = createLlmCompileAgentRunner(makeContext(), { agentRun });
    const step = await runner.nextStep(view());

    expect(step).toEqual({ tool: "search_blocks", input: { query: "graph state", limit: 8 } });
    expect(capturedAgent).toMatchObject({
      model: "gpt-5-mini",
      toolUseBehavior: "stop_on_first_tool",
      tools: [{ name: "get_source" }, { name: "search_blocks" }],
    });
    expect(capturedInput).toContain("Available tools this round: get_source, search_blocks");
    expect(capturedOptions).toEqual({ maxTurns: 1 });
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("default client throws a clear error when the Agents SDK returns no tool choice", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const agentRun: AgentsSdkRun = async () =>
    ({
      finalOutput: "I think we should search first.",
    }) as Awaited<ReturnType<AgentsSdkRun>>;

  try {
    const runner = createLlmCompileAgentRunner(makeContext(), { agentRun });
    await expect(runner.nextStep(view())).rejects.toThrow("did not return a tool choice");
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
