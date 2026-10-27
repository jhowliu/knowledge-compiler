import { z } from "zod";

export const askSchema = z.object({
  query: z.string().trim().min(1),
});
