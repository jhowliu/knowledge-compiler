import { chunkKnowledgeMarkdown } from "../src/services/sourceChunker.service.js";

describe("chunkKnowledgeMarkdown semantic chunking", () => {
  const binarySearchNote = [
    "# Binary Search on Answer",
    "",
    "Binary search on the answer space finds the smallest or largest value that satisfies a monotonic predicate.",
    "",
    "## Steps",
    "1. Define the search bounds lo and hi.",
    "2. Define a monotonic predicate ok(x).",
    "3. Binary search for the boundary where ok(x) flips.",
    "",
    "## Examples",
    "- Koko eating bananas: minimum eating speed.",
    "- Split array largest sum: minimize the largest subarray sum.",
    "",
    "## Common mistakes",
    "- Off-by-one errors in the bounds.",
    "- Choosing a non-monotonic predicate.",
  ].join("\n");

  test("splits a structured note into definition, steps, examples, and mistakes blocks", () => {
    const blocks = chunkKnowledgeMarkdown(binarySearchNote);

    const headings = blocks.map((block) => block.heading);
    expect(headings).toEqual([
      "Binary Search on Answer",
      "Steps",
      "Examples",
      "Common mistakes",
    ]);

    // Regression: structure must not collapse into a single block.
    expect(blocks.length).toBeGreaterThanOrEqual(4);

    const examples = blocks.find((block) => block.heading === "Examples");
    expect(examples?.bodyMarkdown).toContain("Koko eating bananas");
    expect(examples?.bodyMarkdown).not.toContain("search bounds");
  });

  test("records semantic role and strategy version metadata", () => {
    const blocks = chunkKnowledgeMarkdown(binarySearchNote);

    const steps = blocks.find((block) => block.heading === "Steps");
    expect(steps?.metadata).toMatchObject({
      semanticRole: "steps",
      sourceHeading: "Steps",
      chunkStrategyVersion: "semantic-v1",
    });
    expect(steps?.metadata?.sectionPath).toEqual(["Binary Search on Answer", "Steps"]);

    const mistakes = blocks.find((block) => block.heading === "Common mistakes");
    expect(mistakes?.metadata).toMatchObject({ semanticRole: "common-mistakes" });
  });

  test("recognizes inline section labels without headings", () => {
    const note = [
      "Dijkstra finds shortest paths from a source in a weighted graph.",
      "",
      "**Steps:**",
      "1. Push the source with distance 0.",
      "2. Pop the closest node and relax its edges.",
      "",
      "Examples:",
      "- Network routing.",
    ].join("\n");

    const blocks = chunkKnowledgeMarkdown(note);
    const roles = blocks.map((block) => block.metadata?.semanticRole);
    expect(roles).toContain("steps");
    expect(roles).toContain("examples");
  });

  test("never splits a code fence mid-fence", () => {
    const longComment = "x".repeat(3200);
    const note = [
      "# Snippet",
      "",
      "Intro paragraph.",
      "",
      "## Code",
      "```ts",
      `// ${longComment}`,
      "const value = compute();",
      "```",
    ].join("\n");

    const blocks = chunkKnowledgeMarkdown(note);
    const codeBlocks = blocks.filter((block) => block.bodyMarkdown.includes("```"));
    for (const block of codeBlocks) {
      const fenceCount = (block.bodyMarkdown.match(/```/g) ?? []).length;
      expect(fenceCount % 2).toBe(0);
    }
  });

  test("tiny notes still produce at least one valid block", () => {
    const blocks = chunkKnowledgeMarkdown("Just a short standalone fact.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].bodyMarkdown).toBe("Just a short standalone fact.");
    expect(blocks[0].metadata?.chunkStrategyVersion).toBe("semantic-v1");
  });

  test("merges adjacent sections that share the same semantic role", () => {
    const note = [
      "## Example",
      "- First example.",
      "",
      "## Example",
      "- Second example.",
    ].join("\n");

    const blocks = chunkKnowledgeMarkdown(note);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].bodyMarkdown).toContain("First example");
    expect(blocks[0].bodyMarkdown).toContain("Second example");
  });
});
