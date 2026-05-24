import { z } from "zod";

export const ingestRawNoteSchema = z.object({
  rawNoteId: z.string().uuid(),
});
