import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import type { RawNoteRepository } from "./repositories/rawNote.repository.js";
import { PostgresRawNoteRepository } from "./repositories/rawNote.repository.js";
import { createRawNoteRoutes } from "./routes/rawNote.routes.js";
import { RawNoteService } from "./services/rawNote.service.js";
import { errorHandler } from "./middleware/errorHandler.js";

export type AppDependencies = {
  rawNoteRepository?: RawNoteRepository;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const rawNoteRepository = dependencies.rawNoteRepository ?? new PostgresRawNoteRepository();
  const rawNoteService = new RawNoteService(rawNoteRepository);

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.use("/raw-notes", createRawNoteRoutes(rawNoteService));
  app.use(errorHandler);

  return app;
}
