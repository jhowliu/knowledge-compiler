export const agentRunEventCategories = [
  "lifecycle",
  "source",
  "tool",
  "indexing",
  "proposal",
  "eval",
  "linking",
  "error",
] as const;

export type AgentRunEventCategory = (typeof agentRunEventCategories)[number];

export const agentRunEventNames = [
  "queued",
  "retry_queued",
  "retry_of",
  "started",
  "completed",
  "failed",
  "notes_loaded",
  "raw_note_loaded",
  "raw_source_loaded",
  "called",
  "result",
  "classification_started",
  "outcome_classified",
  "extraction_completed",
  "react_loop_started",
  "detected",
  "drafted",
  "related_found",
  "loop_exited",
  "created",
  "scored",
  "candidates_found",
  "judged",
  "suggestion_created",
  "unknown",
] as const;

export type AgentRunEventName = (typeof agentRunEventNames)[number];

export type AgentRunEventKey = `${AgentRunEventCategory}.${AgentRunEventName}`;

export type AgentRunEventDescriptor = {
  category: AgentRunEventCategory;
  name: AgentRunEventName;
};

export const agentRunEvents = {
  lifecycle: {
    queued: { category: "lifecycle", name: "queued" },
    retryQueued: { category: "lifecycle", name: "retry_queued" },
    retryOf: { category: "lifecycle", name: "retry_of" },
    started: { category: "lifecycle", name: "started" },
    completed: { category: "lifecycle", name: "completed" },
    failed: { category: "lifecycle", name: "failed" },
  },
  source: {
    notesLoaded: { category: "source", name: "notes_loaded" },
    rawNoteLoaded: { category: "source", name: "raw_note_loaded" },
    rawSourceLoaded: { category: "source", name: "raw_source_loaded" },
  },
  tool: {
    called: { category: "tool", name: "called" },
    result: { category: "tool", name: "result" },
  },
  indexing: {
    classificationStarted: { category: "indexing", name: "classification_started" },
    outcomeClassified: { category: "indexing", name: "outcome_classified" },
    extractionCompleted: { category: "indexing", name: "extraction_completed" },
    reactLoopStarted: { category: "indexing", name: "react_loop_started" },
    detected: { category: "indexing", name: "detected" },
    drafted: { category: "indexing", name: "drafted" },
    relatedFound: { category: "indexing", name: "related_found" },
    loopExited: { category: "indexing", name: "loop_exited" },
  },
  proposal: {
    created: { category: "proposal", name: "created" },
  },
  eval: {
    completed: { category: "eval", name: "completed" },
  },
  linking: {
    scored: { category: "linking", name: "scored" },
    candidatesFound: { category: "linking", name: "candidates_found" },
    judged: { category: "linking", name: "judged" },
    suggestionCreated: { category: "linking", name: "suggestion_created" },
  },
  error: {
    failed: { category: "error", name: "failed" },
    unknown: { category: "error", name: "unknown" },
  },
} as const satisfies Record<string, Record<string, AgentRunEventDescriptor>>;
