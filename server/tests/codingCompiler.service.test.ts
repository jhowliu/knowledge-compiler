import { CodingCompilerService } from "../src/services/codingCompiler.service.js";

describe("CodingCompilerService", () => {
  test("extracts coding concepts from a LeetCode reflection", () => {
    const service = new CodingCompilerService();

    const extraction = service.extract({
      id: "raw-note-1",
      userId: null,
      rawSourceId: null,
      domain: null,
      sourceType: "manual",
      sourceRole: "personal_note" as const,
      title: null,
      bodyMarkdown:
        "1334. Find the City With the Smallest Number of Neighbors. I missed that this was all-pairs shortest path and should use Floyd-Warshall.",
      extractedData: {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    });

    expect(extraction.domain).toBe("coding");
    expect(extraction.knowledgeType).toBe("problem_reflection");
    expect(extraction.problemNumber).toBe("1334");
    expect(extraction.problemTitle).toBe("Find the City With the Smallest Number of Neighbors");
    expect(extraction.patterns).toContain("All-Pairs Shortest Path");
    expect(extraction.algorithms).toContain("Floyd-Warshall");
    expect(extraction.mistakes[0]).toContain("missed");
  });

  test("drafts proposal items for compiled knowledge only", () => {
    const service = new CodingCompilerService();
    const rawNote = {
      id: "raw-note-1",
      userId: null,
      rawSourceId: null,
      domain: null,
      sourceType: "manual",
      sourceRole: "personal_note" as const,
      title: null,
      bodyMarkdown:
        "1209. Remove All Adjacent Duplicates in String II. I did not realize I could use a counter with a stack.",
      extractedData: {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    const extraction = service.extract(rawNote);

    const proposal = service.draftProposal(rawNote, extraction, []);

    expect(proposal.detectedDomain).toBe("coding");
    expect(proposal.items.map((item) => item.actionType)).toContain("upsert_compiled_note");
    expect(proposal.items.some((item) => item.actionType === "create_mistake")).toBe(false);
    expect(proposal.items.some((item) => item.actionType === "create_review_task")).toBe(false);
    expect(proposal.items.some((item) => item.actionType === "upsert_readiness")).toBe(false);
  });

  test("keeps algorithm decision guides as general knowledge", () => {
    const service = new CodingCompilerService();
    const rawNote = {
      id: "raw-note-2",
      userId: null,
      rawSourceId: null,
      domain: null,
      sourceType: "manual",
      sourceRole: "personal_note" as const,
      title: "Shortest Path Decision Guide",
      bodyMarkdown: [
        "Shortest Path",
        "1. Weight = 1 => BFS",
        "2. Weight > 0 => Dijkstra",
        "3. Negative weights => Bellman-Ford",
        "4. All pairs => Floyd-Warshall",
        "Common trap: negative cycles need one extra relaxation pass.",
      ].join("\n"),
      extractedData: {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };

    const extraction = service.extract(rawNote);
    const proposal = service.draftProposal(rawNote, extraction, []);

    expect(extraction.knowledgeType).toBe("general_coding_note");
    expect(extraction.decisionRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ signal: "Weight = 1", recommendation: "BFS" }),
        expect.objectContaining({ signal: "All pairs", recommendation: "Floyd-Warshall" }),
      ]),
    );
    expect(extraction.mistakes).toHaveLength(0);
    expect(proposal.items[0].payload.noteType).toBe("knowledge_note");
    expect(proposal.items.some((item) => item.actionType === "create_mistake")).toBe(false);
    expect(
      proposal.items.some(
        (item) => item.actionType === "upsert_compiled_note" && item.payload.noteType === "algorithm",
      ),
    ).toBe(false);
  });
});
