import { z } from "zod";

export const ingestRawNoteSchema = z.object({
  rawNoteId: z.string().uuid(),
});

export const enqueueAgentRunSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  runType: z.literal("reindex_links"),
  input: z.record(z.string(), z.unknown()).optional(),
});
