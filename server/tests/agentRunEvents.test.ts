import { agentRunEventCategories, agentRunEvents } from "../src/domain/agentRunEvents.js";

describe("agent run event model", () => {
  test("keeps the event category vocabulary small", () => {
    expect(agentRunEventCategories).toEqual([
      "lifecycle",
      "source",
      "tool",
      "indexing",
      "proposal",
      "eval",
      "linking",
      "error",
    ]);
  });

  test("defines stable normalized events", () => {
    expect(agentRunEvents.lifecycle.completed).toEqual({
      category: "lifecycle",
      name: "completed",
    });
    expect(agentRunEvents.indexing.drafted).toEqual({
      category: "indexing",
      name: "drafted",
    });
  });
});
