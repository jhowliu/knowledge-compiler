import type { Request } from "express";

export function requireStringParam(request: Request, name: string) {
  const value = request.params[name];
  if (typeof value !== "string") {
    throw new Error(`Missing route parameter: ${name}`);
  }

  return value;
}
