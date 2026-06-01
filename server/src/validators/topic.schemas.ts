import { z } from "zod";

export const createTopicSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1),
  color: z.string().trim().min(1).nullable().optional(),
});

export const updateTopicSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).nullable().optional(),
});
