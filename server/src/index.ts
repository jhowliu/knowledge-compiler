import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { rawNotesRouter } from "./notes/rawNotesRouter.js";

const app = express();

app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_request, response, next) => {
  try {
    await pool.query("select 1");
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use("/raw-notes", rawNotesRouter);

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    response.status(500).json({ error: "Internal server error" });
  },
);

app.listen(env.SERVER_PORT, () => {
  console.log(`Knowledge Compiler API listening on http://localhost:${env.SERVER_PORT}`);
});
