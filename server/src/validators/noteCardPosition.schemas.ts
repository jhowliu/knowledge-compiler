import { z } from "zod";

export const saveNoteCardPositionSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  boardKey: z.string().min(1).max(80).optional(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});
