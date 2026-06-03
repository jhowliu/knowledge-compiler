import { z } from "zod";

const graphRelationTypes = [
  "supports",
  "prerequisite",
  "example_of",
  "contrasts",
  "duplicate_candidate",
  "related_concept",
  "contrasts_with",
  "part_of",
] as const;

export const createNoteLinkSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  sourceNoteId: z.string().uuid(),
  targetNoteId: z.string().uuid(),
  relationType: z.enum(graphRelationTypes),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  rationale: z.string().min(1).nullable().optional(),
});

export const updateNoteLinkSchema = z.object({
  relationType: z.enum(graphRelationTypes),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  rationale: z.string().min(1).nullable().optional(),
});
