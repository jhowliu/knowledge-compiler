import { createRawNoteSchema } from "../src/validators/rawNote.schemas.js";

describe("createRawNoteSchema", () => {
  test("accepts a minimal raw note payload", () => {
    const result = createRawNoteSchema.parse({
      bodyMarkdown: "I missed the all-pairs shortest path signal.",
    });

    expect(result.bodyMarkdown).toBe("I missed the all-pairs shortest path signal.");
  });

  test("rejects an empty note body", () => {
    expect(() =>
        createRawNoteSchema.parse({
          bodyMarkdown: "",
        })).toThrow(/Too small/);
  });
});
