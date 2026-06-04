/**
 * Harnessed agentic ReAct loop driver (#107, Part B — foundation).
 *
 * The model (an {@link AgentRunner}) chooses which tool to call each round; the
 * driver owns the *guarantees*: which tools are legal right now (dynamic tool
 * exposure / preconditions), the round and per-tool call caps, terminal-tool
 * handling, and turning tool validation errors into retryable observations.
 *
 * It is intentionally generic over the tool set and decoupled from the database
 * (events are emitted through {@link LoopEvent} callbacks) so it can be unit
 * tested deterministically with a scripted runner and fake tools — no LLM.
 */

export type LoopToolResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string };

export type LoopTranscriptEntry = {
  round: number;
  tool: string;
  input: unknown;
  result: LoopToolResult;
};

export type LoopView = {
  round: number;
  /** Tools the runner is allowed to call this round (preconditions + caps applied). */
  availableTools: string[];
  transcript: ReadonlyArray<LoopTranscriptEntry>;
};

export type AgentRunner = {
  /** Decide the next tool call given what is legal and what has happened so far. */
  nextStep(view: LoopView): Promise<{ tool: string; input: unknown }>;
};

export type LoopTool = {
  name: string;
  /** A terminal tool ends the loop on success (e.g. draft_proposal / finish). */
  terminal?: boolean;
  /** Whether this tool may be called given the state so far (dynamic exposure). */
  canRun(view: LoopView): boolean;
  /** Runs the tool. Throwing is treated as a retryable validation error. */
  run(input: unknown, view: LoopView): Promise<unknown>;
};

export type LoopExitReason = "terminal" | "max_rounds" | "no_available_tools";

export type LoopOutcome = {
  status: "completed" | "incomplete";
  exitReason: LoopExitReason;
  terminalTool: string | null;
  terminalOutput: unknown;
  rounds: number;
  transcript: LoopTranscriptEntry[];
};

export type LoopEvent =
  | { type: "loop_started"; maxRounds: number; maxCallsPerTool: number }
  | { type: "tool_called"; round: number; tool: string; input: unknown }
  | { type: "tool_result"; round: number; tool: string; result: LoopToolResult }
  | { type: "tool_rejected"; round: number; tool: string; reason: string }
  | { type: "loop_exited"; reason: LoopExitReason; terminalTool: string | null };

export type RunAgentLoopOptions = {
  runner: AgentRunner;
  tools: LoopTool[];
  /** Max tool-call rounds per run (PRD §11.1). */
  maxRounds?: number;
  /** Max calls to the same tool per run (PRD §11.1). */
  maxCallsPerTool?: number;
  onEvent?: (event: LoopEvent) => void | Promise<void>;
};

export async function runAgentLoop(options: RunAgentLoopOptions): Promise<LoopOutcome> {
  const maxRounds = options.maxRounds ?? 8;
  const maxCallsPerTool = options.maxCallsPerTool ?? 3;
  const toolsByName = new Map(options.tools.map((tool) => [tool.name, tool]));
  const callCounts = new Map<string, number>();
  const transcript: LoopTranscriptEntry[] = [];

  const emit = async (event: LoopEvent) => {
    if (options.onEvent) await options.onEvent(event);
  };

  const exit = async (
    status: LoopOutcome["status"],
    exitReason: LoopExitReason,
    terminalTool: string | null,
    terminalOutput: unknown,
    rounds: number,
  ): Promise<LoopOutcome> => {
    await emit({ type: "loop_exited", reason: exitReason, terminalTool });
    return { status, exitReason, terminalTool, terminalOutput, rounds, transcript };
  };

  await emit({ type: "loop_started", maxRounds, maxCallsPerTool });

  let round = 1;
  while (round <= maxRounds) {
    const baseView: LoopView = { round, availableTools: [], transcript };
    const availableTools = options.tools
      .filter((tool) => (callCounts.get(tool.name) ?? 0) < maxCallsPerTool && tool.canRun(baseView))
      .map((tool) => tool.name);

    if (availableTools.length === 0) {
      return exit("incomplete", "no_available_tools", null, null, round - 1);
    }

    const view: LoopView = { round, availableTools, transcript };
    const step = await options.runner.nextStep(view);
    const tool = toolsByName.get(step.tool);

    // Reject illegal choices but keep the loop bounded: the rejection is recorded
    // so the runner can correct next round, and the round still advances.
    if (!tool) {
      const reason = `Unknown tool: ${step.tool}`;
      await emit({ type: "tool_rejected", round, tool: step.tool, reason });
      transcript.push({ round, tool: step.tool, input: step.input, result: { ok: false, error: reason } });
      round += 1;
      continue;
    }
    if (!availableTools.includes(tool.name)) {
      const capped = (callCounts.get(tool.name) ?? 0) >= maxCallsPerTool;
      const reason = capped
        ? `Tool ${tool.name} reached its call cap (${maxCallsPerTool})`
        : `Tool ${tool.name} is not available yet (precondition not met)`;
      await emit({ type: "tool_rejected", round, tool: tool.name, reason });
      transcript.push({ round, tool: tool.name, input: step.input, result: { ok: false, error: reason } });
      round += 1;
      continue;
    }

    callCounts.set(tool.name, (callCounts.get(tool.name) ?? 0) + 1);
    await emit({ type: "tool_called", round, tool: tool.name, input: step.input });

    let result: LoopToolResult;
    try {
      const output = await tool.run(step.input, view);
      result = { ok: true, output };
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    transcript.push({ round, tool: tool.name, input: step.input, result });
    await emit({ type: "tool_result", round, tool: tool.name, result });

    if (result.ok && tool.terminal) {
      return exit("completed", "terminal", tool.name, result.output, round);
    }

    round += 1;
  }

  return exit("incomplete", "max_rounds", null, null, maxRounds);
}
