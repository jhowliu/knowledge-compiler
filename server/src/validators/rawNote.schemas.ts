import { z } from "zod";
import { rawSourceRoles } from "../domain/rawSource.js";

const rawSourceRoleSchema = z.enum(rawSourceRoles);

export const createRawNoteSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  domain: z.string().min(1).nullable().optional(),
  subtype: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  sourceRole: rawSourceRoleSchema.optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
});

export const updateRawNoteSchema = z.object({
  domain: z.string().min(1).nullable().optional(),
  subtype: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  sourceRole: rawSourceRoleSchema.optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
});
