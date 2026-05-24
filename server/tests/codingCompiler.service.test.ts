import { CodingCompilerService } from "../src/services/codingCompiler.service.js";

describe("CodingCompilerService", () => {
  test("extracts coding concepts from a LeetCode reflection", () => {
    const service = new CodingCompilerService();

    const extraction = service.extract({
      id: "raw-note-1",
      userId: null,
      domain: null,
      sourceType: "manual",
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

  test("drafts proposal items for compiled knowledge, mistakes, tasks, and readiness", () => {
    const service = new CodingCompilerService();
    const rawNote = {
      id: "raw-note-1",
      userId: null,
      domain: null,
      sourceType: "manual",
      title: null,
      bodyMarkdown:
        "1209. Remove All Adjacent Duplicates in String II. I did not realize I could use a counter with a stack.",
      extractedData: {},
      createdAt: new Date("2026-05-24T00:00:00.000Z"),
    };
    const extraction = service.extract(rawNote);

    const proposal = service.draftProposal(rawNote, extraction, []);

    expect(proposal.detectedDomain).toBe("coding");
    expect(proposal.items.map((item) => item.actionType)).toEqual(
      expect.arrayContaining([
        "upsert_compiled_note",
        "create_mistake",
        "create_review_task",
        "upsert_readiness",
      ]),
    );
  });
});
