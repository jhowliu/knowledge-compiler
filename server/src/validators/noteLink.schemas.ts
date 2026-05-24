import { z } from "zod";

export const createNoteLinkSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  sourceNoteId: z.string().uuid(),
  targetNoteId: z.string().uuid(),
  relationType: z.enum([
    "related_concept",
    "prerequisite",
    "example_of",
    "contrasts_with",
    "part_of",
  ]),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  rationale: z.string().min(1).nullable().optional(),
});
