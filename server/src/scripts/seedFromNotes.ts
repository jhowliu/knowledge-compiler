/**
 * Dev-only: wipe the database and re-ingest seed-notes through the real
 * ingest -> compile -> approve pipeline, in filename order (order matters: later
 * notes update/contradict earlier ones).
 *
 * Usage (from server/):
 *   npm run seed -- --yes              # wipe + seed all notes (in order)
 *   npm run seed -- --yes --phase=1    # Phase 1 only (A* base + B* keep-searchable)
 *   npm run seed -- --yes --phase=2    # Phase 2 only (C/D/E; needs Phase 1 first)
 *   npm run seed -- --yes C1 D1        # only specific notes (prefix match)
 *   npm run seed -- --list             # print the scenario reference, do nothing
 *   npm run seed -- --dry-run          # print the plan, touch nothing
 *
 * Selection: positional prefixes (A, A2, C1, …) and/or --phase=1|2. A subset run
 * does NOT wipe by default (Phase 2 depends on Phase 1 already being seeded and
 * approved); pass --wipe to force a wipe or --no-wipe to skip it. A full run
 * (no selection) wipes by default.
 *
 * Requires the API server to be running (it drives the agent compile queue) and
 * OPENAI_API_KEY configured. Env:
 *   SEED_BASE_URL   API base URL (default http://localhost:${SERVER_PORT||4000})
 *   SEED_NOTES_DIR  seed notes directory (default <repo>/seed-notes)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { closeDatabase, query } from "../db/postgres.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawArgs = process.argv.slice(2);
const flags = rawArgs.filter((arg) => arg.startsWith("--"));
const positional = rawArgs.filter((arg) => !arg.startsWith("--"));
const hasFlag = (name: string) => flags.includes(name);

const dryRun = hasFlag("--dry-run");
const confirmed = hasFlag("--yes");
const listOnly = hasFlag("--list");

// Scenario phases (see seed-notes/README.md): Phase 1 is base knowledge (A*) plus
// keep-searchable notes (B*); Phase 2 is iteration/conflict/link cases (C/D/E)
// which depend on Phase 1 being seeded and approved first.
const phaseGroups: Record<string, string[]> = { "1": ["A", "B"], "2": ["C", "D", "E"] };
const phaseValue = flags.find((flag) => flag.startsWith("--phase="))?.split("=")[1];
const filters = [...positional, ...(phaseValue ? (phaseGroups[phaseValue] ?? []) : [])].map(
  (token) => token.toLowerCase(),
);
const hasSelection = filters.length > 0;

// Full run wipes by default; a subset run does not (so it won't drop the base
// notes a later phase depends on). --wipe / --no-wipe override.
const willWipe = hasFlag("--no-wipe") ? false : hasFlag("--wipe") ? true : !hasSelection;

function selected(fileName: string) {
  if (!filters.length) return true;
  const lower = fileName.toLowerCase();
  return filters.some((filter) => lower.startsWith(filter));
}

const baseUrl = (process.env.SEED_BASE_URL ?? `http://localhost:${env.SERVER_PORT}`).replace(
  /\/$/,
  "",
);
const seedNotesDir = process.env.SEED_NOTES_DIR
  ? path.resolve(process.env.SEED_NOTES_DIR)
  : path.resolve(__dirname, "../../../seed-notes");

const pollIntervalMs = 2000;
const pollTimeoutMs = 5 * 60 * 1000;

function databaseHost() {
  try {
    return new URL(env.DATABASE_URL).host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function wipeDatabase() {
  const tables = await query<{ tablename: string }>(
    `select tablename from pg_tables
     where schemaname = 'public' and tablename <> 'schema_migrations'`,
  );
  if (!tables.rows.length) {
    console.log("• no tables to truncate");
    return;
  }
  const list = tables.rows.map((row) => `"${row.tablename}"`).join(", ");
  await query(`truncate table ${list} restart identity cascade`);
  console.log(`• truncated ${tables.rows.length} tables (kept schema_migrations)`);
}

async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${method} ${route} -> ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

function titleFor(fileName: string, body: string) {
  const heading = body.split("\n").find((line) => /^#\s+/.test(line.trim()));
  return heading ? heading.replace(/^#\s+/, "").trim() : path.basename(fileName, ".md");
}

async function waitForAgentRun(agentRunId: string) {
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    const { agentRun } = await api<{ agentRun: { status: string } }>(
      "GET",
      `/agent-runs/${agentRunId}`,
    );
    if (agentRun.status === "completed") return true;
    if (agentRun.status === "failed") return false;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`agent run ${agentRunId} did not finish within ${pollTimeoutMs}ms`);
}

type Proposal = { id: string; status: string; rawSourceId?: string | null; raw_source_id?: string | null };

async function findPendingProposal(rawSourceId: string) {
  const { proposals } = await api<{ proposals: Proposal[] }>("GET", "/update-proposals");
  return proposals.find(
    (proposal) =>
      proposal.status === "pending" &&
      (proposal.rawSourceId ?? proposal.raw_source_id) === rawSourceId,
  );
}

async function seedNote(fileName: string) {
  const body = await readFile(path.join(seedNotesDir, fileName), "utf8");
  const title = titleFor(fileName, body);
  process.stdout.write(`→ ${fileName}  "${title}"\n`);

  if (dryRun) {
    console.log("    (dry-run) would create source, compile, and approve");
    return;
  }

  const { rawSource } = await api<{ rawSource: { id: string } }>("POST", "/sources", {
    title,
    bodyMarkdown: body,
  });

  const { agentRunId } = await api<{ agentRunId: string | null }>(
    "POST",
    `/sources/${rawSource.id}/compile`,
  );
  if (!agentRunId) {
    console.log("    no agent run started (compile queue disabled) — skipped");
    return;
  }

  const ok = await waitForAgentRun(agentRunId);
  if (!ok) {
    console.log("    ✗ compile failed — skipped");
    return;
  }

  const proposal = await findPendingProposal(rawSource.id);
  if (!proposal) {
    console.log("    • no approvable proposal (kept searchable / no change) — skipped");
    return;
  }

  await api("POST", `/update-proposals/${proposal.id}/approve`);
  console.log(`    ✓ approved proposal ${proposal.id}`);
}

async function run() {
  const allNotes = (await readdir(seedNotesDir))
    .filter((name) => /^[A-Z]\d.*\.md$/.test(name))
    .sort();
  const entries = allNotes.filter(selected);

  if (listOnly) {
    console.log("Seed scenarios (seed-notes/README.md):");
    console.log("  Phase 1 (base + keep-searchable):  A*, B*");
    console.log("  Phase 2 (iteration/conflict/link): C*, D*, E*  (needs Phase 1 first)");
    console.log(`\nAvailable notes:\n  ${allNotes.join("\n  ")}`);
    return;
  }

  if (phaseValue && !phaseGroups[phaseValue]) {
    throw new Error(`unknown --phase=${phaseValue} (expected 1 or 2)`);
  }

  console.log(`Seed plan:`);
  console.log(`  API:       ${baseUrl}`);
  console.log(`  Database:  ${databaseHost()}`);
  console.log(`  Notes dir: ${seedNotesDir}`);
  console.log(`  Selection: ${hasSelection ? filters.join(", ") : "all"}`);
  console.log(`  Notes:     ${entries.length} (${entries.join(", ") || "none"})`);
  console.log(`  Wipe:      ${willWipe ? "yes" : "no"}   Dry-run: ${dryRun}`);

  if (!entries.length) {
    throw new Error(`no seed notes matched selection in ${seedNotesDir}`);
  }

  if (hasSelection && willWipe) {
    console.log(
      "\n⚠️  Wiping with a subset selected — notes outside the selection will be gone.",
    );
  }

  if (!dryRun && !confirmed) {
    console.log(
      "\nRefusing to modify data without --yes. Re-run with --yes (or use --dry-run).",
    );
    return;
  }

  if (!dryRun && willWipe) {
    console.log("\nWiping database…");
    await wipeDatabase();
  }

  console.log("\nSeeding…");
  for (const fileName of entries) {
    await seedNote(fileName);
  }
  console.log("\nDone.");
}

run()
  .catch((error) => {
    console.error("\nseed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
