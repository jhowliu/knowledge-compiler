import { z } from "zod";

export const enqueueAgentRunSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  runType: z.literal("compile_raw_note"),
  input: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, context) => {
  if (
    !(
      typeof value.input?.rawSourceId === "string" &&
      z.string().min(1).safeParse(value.input.rawSourceId).success
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "compile_raw_note requires input.rawSourceId",
      path: ["input"],
    });
  }
});
