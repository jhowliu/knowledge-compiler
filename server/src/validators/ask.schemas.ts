import { z } from "zod";

export const askSchema = z.object({
  query: z.string().trim().min(1),
  topic_ids: z.array(z.string().uuid()).optional(),
  topicIds: z.array(z.string().uuid()).optional(),
});
