import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, query, transaction } from "./postgres.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

async function ensureMigrationsTable() {
  await query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function appliedVersions() {
  const result = await query<{ version: string }>(
    "select version from schema_migrations order by version",
  );
  return new Set(result.rows.map((row) => row.version));
}

async function run() {
  await ensureMigrationsTable();
  const applied = await appliedVersions();
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    try {
      await transaction(async (transactionQuery) => {
        await transactionQuery(sql);
        await transactionQuery("insert into schema_migrations (version) values ($1)", [file]);
      });
      console.log(`applied ${file}`);
    } catch (error) {
      throw error;
    }
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
