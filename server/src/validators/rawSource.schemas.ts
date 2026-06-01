import { z } from "zod";
import { rawSourceRoles } from "../domain/rawSource.js";

const rawSourceRoleSchema = z.enum(rawSourceRoles);

export const createRawSourceSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  subtype: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  sourceRole: rawSourceRoleSchema.optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateRawSourceSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  subtype: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  sourceRole: rawSourceRoleSchema.optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateSourceTopicsSchema = z.object({
  topicIds: z.array(z.string().uuid()),
});

export const createSourceProjectSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createSourceFolderSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const renameSourceProjectSchema = z.object({
  name: z.string().trim().min(1),
});

export const renameSourceFolderSchema = z.object({
  name: z.string().trim().min(1),
});

export const moveRawSourceSchema = z.object({
  projectId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
});
