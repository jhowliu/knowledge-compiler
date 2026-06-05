import { chunkKnowledgeMarkdown } from "../src/services/sourceChunker.service.js";

describe("chunkKnowledgeMarkdown fixed-size chunking", () => {
  test("splits a long note into multiple size-bounded blocks", () => {
    const paragraph = (label: string) => `${label}: ${"word ".repeat(120).trim()}`;
    const note = [paragraph("A"), paragraph("B"), paragraph("C"), paragraph("D")].join("\n\n");

    const blocks = chunkKnowledgeMarkdown(note);

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      // Allow a single oversized paragraph to exceed the target, but grouped
      // paragraphs must stay near the fixed-size budget.
      expect(block.bodyMarkdown.length).toBeLessThanOrEqual(2000);
    }
    // No content is lost across the split.
    expect(blocks.map((block) => block.bodyMarkdown).join("\n\n")).toContain("A:");
    expect(blocks.map((block) => block.bodyMarkdown).join("\n\n")).toContain("D:");
  });

  test("tags blocks with the fixed-size strategy version and no hardcoded section metadata", () => {
    const blocks = chunkKnowledgeMarkdown("# Title\n\nA short paragraph.");
    expect(blocks[0].metadata).toEqual({ chunkStrategyVersion: "fixed-size-v1" });
    expect(blocks[0].metadata).not.toHaveProperty("sectionPath");
    expect(blocks[0].metadata).not.toHaveProperty("semanticRole");
  });

  test("never splits a code fence mid-fence", () => {
    const longComment = "x".repeat(3200);
    const note = [
      "Intro paragraph.",
      "",
      "```ts",
      `// ${longComment}`,
      "const value = compute();",
      "```",
      "",
      "Trailing paragraph.",
    ].join("\n");

    const blocks = chunkKnowledgeMarkdown(note);
    for (const block of blocks) {
      const fenceCount = (block.bodyMarkdown.match(/```/g) ?? []).length;
      expect(fenceCount % 2).toBe(0);
    }
  });

  test("tiny notes still produce one valid block", () => {
    const blocks = chunkKnowledgeMarkdown("Just a short standalone fact.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].bodyMarkdown).toBe("Just a short standalone fact.");
    expect(blocks[0].metadata?.chunkStrategyVersion).toBe("fixed-size-v1");
  });

  test("empty input still yields a block", () => {
    const blocks = chunkKnowledgeMarkdown("");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].blockIndex).toBe(0);
  });
});
