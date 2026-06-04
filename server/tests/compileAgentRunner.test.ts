import {
  createLlmCompileAgentRunner,
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

test("default client calls the Responses API with function tools and parses the call", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let requestBody: any = null;
  global.fetch = (async (_url: unknown, init: { body: string }) => {
    requestBody = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return {
          output: [
            {
              type: "function_call",
              name: "search_blocks",
              arguments: JSON.stringify({ query: "graph state", limit: 8 }),
            },
          ],
        };
      },
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const runner = createLlmCompileAgentRunner(makeContext());
    const step = await runner.nextStep(view());

    expect(step).toEqual({ tool: "search_blocks", input: { query: "graph state", limit: 8 } });
    expect(requestBody.tool_choice).toBe("required");
    expect(requestBody.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "get_source",
      "search_blocks",
    ]);
    expect(requestBody.tools[0]).toMatchObject({ type: "function", strict: false });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("default client throws a clear error when the model returns no tool call", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = (async () =>
    ({
      ok: true,
      async json() {
        return { output_text: "I think we should search first." };
      },
    } as unknown as Response)) as typeof fetch;

  try {
    const runner = createLlmCompileAgentRunner(makeContext());
    await expect(runner.nextStep(view())).rejects.toThrow("did not return a tool call");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
