import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../domain/errors.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Invalid request",
      issues: error.issues,
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
};
