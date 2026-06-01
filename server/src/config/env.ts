import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEnvPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../.env");

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const parsedEnv = parse(readFileSync(filePath));
  for (const [key, value] of Object.entries(parsedEnv)) {
    if (value === "") {
      continue;
    }
    process.env[key] = value;
  }
}

loadEnvFile(rootEnvPath);
loadEnvFile(serverEnvPath);

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  SESSION_SECRET: z.string().min(16).default("change-me-in-development"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_WIKI_INDEX_MODEL: z.string().default("gpt-5-mini"),
  INDEXER_MODEL: z.string().default("gpt-5-mini"),
  EVAL_JUDGE_MODEL: z.string().default("gpt-5-mini"),
  ASK_MODEL: z.string().default("gpt-5-mini"),
});

export const env = envSchema.parse(process.env);
