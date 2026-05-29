import { createRawNoteSchema } from "../src/validators/rawNote.schemas.js";

describe("createRawNoteSchema", () => {
  test("accepts a minimal raw note payload", () => {
    const result = createRawNoteSchema.parse({
      bodyMarkdown: "I missed the all-pairs shortest path signal.",
    });

    expect(result.bodyMarkdown).toBe("I missed the all-pairs shortest path signal.");
    expect(result.sourceRole).toBeUndefined();
  });

  test("accepts source roles for the generalized source entry", () => {
    const result = createRawNoteSchema.parse({
      sourceRole: "reference",
      title: "Paper note",
      bodyMarkdown: "A source summary.",
    });

    expect(result.sourceRole).toBe("reference");
  });

  test("rejects an empty note body", () => {
    expect(() =>
        createRawNoteSchema.parse({
          bodyMarkdown: "",
        })).toThrow(/Too small/);
  });
});
