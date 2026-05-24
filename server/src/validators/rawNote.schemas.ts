import { z } from "zod";

export const createRawNoteSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  domain: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
});
