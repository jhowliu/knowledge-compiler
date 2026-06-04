import {
  runAgentLoop,
  type AgentRunner,
  type LoopEvent,
  type LoopTool,
  type LoopView,
} from "../src/services/agentLoop.js";

/** A runner that plays back a fixed list of tool calls, then repeats the last one. */
function scriptedRunner(steps: Array<{ tool: string; input?: unknown }>): AgentRunner {
  let index = 0;
  return {
    async nextStep() {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return { tool: step.tool, input: step.input ?? {} };
    },
  };
}

function tool(name: string, overrides: Partial<LoopTool> = {}): LoopTool {
  return {
    name,
    canRun: () => true,
    run: async () => ({ ok: name }),
    ...overrides,
  };
}

function hasRunSuccessfully(view: LoopView, toolName: string) {
  return view.transcript.some((entry) => entry.tool === toolName && entry.result.ok);
}

describe("runAgentLoop", () => {
  test("varies tool order and exits when the model calls a terminal tool", async () => {
    const runner = scriptedRunner([
      { tool: "get_source" },
      { tool: "search_blocks" },
      { tool: "draft_proposal" },
    ]);
    const tools = [
      tool("get_source"),
      tool("search_blocks"),
      tool("draft_proposal", { terminal: true, run: async () => ({ proposal_id: "p1" }) }),
    ];

    const outcome = await runAgentLoop({ runner, tools });

    expect(outcome.status).toBe("completed");
    expect(outcome.exitReason).toBe("terminal");
    expect(outcome.terminalTool).toBe("draft_proposal");
    expect(outcome.terminalOutput).toEqual({ proposal_id: "p1" });
    expect(outcome.transcript.map((entry) => entry.tool)).toEqual([
      "get_source",
      "search_blocks",
      "draft_proposal",
    ]);
  });

  test("marks the run incomplete when the round cap is hit before a terminal tool", async () => {
    const runner = scriptedRunner([{ tool: "search_blocks" }]);
    const tools = [tool("search_blocks")];

    const outcome = await runAgentLoop({ runner, tools, maxRounds: 3, maxCallsPerTool: 10 });

    expect(outcome.status).toBe("incomplete");
    expect(outcome.exitReason).toBe("max_rounds");
    expect(outcome.terminalTool).toBeNull();
    expect(outcome.transcript.filter((entry) => entry.tool === "search_blocks")).toHaveLength(3);
  });

  test("enforces the per-tool call cap", async () => {
    const runner = scriptedRunner([{ tool: "search_blocks" }]);
    const tools = [tool("search_blocks")];

    const outcome = await runAgentLoop({ runner, tools, maxRounds: 8, maxCallsPerTool: 2 });

    // search_blocks is the only tool; after 2 calls nothing is available.
    expect(outcome.exitReason).toBe("no_available_tools");
    expect(outcome.transcript.filter((entry) => entry.tool === "search_blocks" && entry.result.ok)).toHaveLength(2);
  });

  test("hides a tool until its precondition is met (dynamic exposure)", async () => {
    const seenAvailability: string[][] = [];
    const recordingRunner: AgentRunner = {
      async nextStep(view) {
        seenAvailability.push([...view.availableTools]);
        // Try to draft immediately (illegal), then search, then draft.
        if (view.transcript.length === 0) return { tool: "draft_proposal", input: {} };
        if (!hasRunSuccessfully(view, "search_blocks")) return { tool: "search_blocks", input: {} };
        return { tool: "draft_proposal", input: {} };
      },
    };
    const events: LoopEvent[] = [];
    const tools = [
      tool("search_blocks"),
      tool("draft_proposal", {
        terminal: true,
        canRun: (view) => hasRunSuccessfully(view, "search_blocks"),
        run: async () => ({ proposal_id: "p1" }),
      }),
    ];

    const outcome = await runAgentLoop({
      runner: recordingRunner,
      tools,
      onEvent: (event) => {
        events.push(event);
      },
    });

    // draft_proposal was not offered before search_blocks ran.
    expect(seenAvailability[0]).not.toContain("draft_proposal");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool_rejected", tool: "draft_proposal" }),
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.terminalTool).toBe("draft_proposal");
  });

  test("turns a tool validation error into a retryable observation", async () => {
    let attempts = 0;
    const runner: AgentRunner = {
      async nextStep(view) {
        // First draft has a bad span; correct it after seeing the error.
        const lastFailed = view.transcript.at(-1)?.result.ok === false;
        if (!hasRunSuccessfully(view, "draft_proposal") && (view.transcript.length === 0 || lastFailed)) {
          return { tool: "draft_proposal", input: { valid: view.transcript.length > 0 } };
        }
        return { tool: "draft_proposal", input: { valid: true } };
      },
    };
    const tools = [
      tool("draft_proposal", {
        terminal: true,
        run: async (input) => {
          attempts += 1;
          if (!(input as { valid?: boolean }).valid) {
            throw new Error("source span failed verbatim validation");
          }
          return { proposal_id: "p1" };
        },
      }),
    ];

    const outcome = await runAgentLoop({ runner, tools, maxCallsPerTool: 3 });

    expect(attempts).toBe(2);
    expect(outcome.status).toBe("completed");
    expect(outcome.transcript[0].result).toEqual({
      ok: false,
      error: "source span failed verbatim validation",
    });
    expect(outcome.transcript[1].result).toEqual({ ok: true, output: { proposal_id: "p1" } });
  });

  test("rejects unknown tools without crashing the loop", async () => {
    const runner = scriptedRunner([{ tool: "not_a_tool" }, { tool: "draft_proposal" }]);
    const events: LoopEvent[] = [];
    const tools = [tool("draft_proposal", { terminal: true, run: async () => ({ proposal_id: "p1" }) })];

    const outcome = await runAgentLoop({
      runner,
      tools,
      onEvent: (event) => {
        events.push(event);
      },
    });

    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool_rejected", tool: "not_a_tool" }),
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.terminalTool).toBe("draft_proposal");
  });
});
