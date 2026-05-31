import { z } from "zod";
import { rawSourceRoles } from "../domain/rawSource.js";

const rawSourceRoleSchema = z.enum(rawSourceRoles);

export const createRawSourceSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  domain: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  sourceRole: rawSourceRoleSchema.optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateRawSourceSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  domain: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  sourceRole: rawSourceRoleSchema.optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
