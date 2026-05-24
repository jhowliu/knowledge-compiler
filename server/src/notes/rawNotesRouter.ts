import { Router } from "express";
import { z } from "zod";
import { createRawNote, listRawNotes } from "./rawNoteQueries.js";

const createRawNoteSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  domain: z.string().min(1).nullable().optional(),
  sourceType: z.string().min(1).optional(),
  title: z.string().min(1).nullable().optional(),
  bodyMarkdown: z.string().min(1),
});

export const rawNotesRouter = Router();

rawNotesRouter.get("/", async (_request, response, next) => {
  try {
    response.json({ rawNotes: await listRawNotes() });
  } catch (error) {
    next(error);
  }
});

rawNotesRouter.post("/", async (request, response, next) => {
  try {
    const input = createRawNoteSchema.parse(request.body);
    const rawNote = await createRawNote(input);
    response.status(201).json({ rawNote });
  } catch (error) {
    next(error);
  }
});
