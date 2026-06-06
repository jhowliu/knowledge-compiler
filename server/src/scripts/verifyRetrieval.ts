/**
 * Verifies retrieval health after enabling pgvector + reseeding.
 *
 * Part A (DB): pgvector installed, embedding column present, how many blocks
 *   have embeddings / contextual context, and how CJK text tokenizes.
 * Part B (HTTP): runs probe queries against /search (and one /ask) on the
 *   running server and prints the top hits so you can eyeball hit quality.
 *
 * Usage (from server/):  npm run verify-retrieval
 * Env: SEED_BASE_URL (default http://localhost:${SERVER_PORT})
 */
import { env } from "../config/env.js";
import { closeDatabase, query } from "../db/postgres.js";

const baseUrl = (process.env.SEED_BASE_URL ?? `http://localhost:${env.SERVER_PORT}`).replace(/\/$/, "");

const probes = [
  "binary search examples",
  "give me examples of binary search on answer",
  "dijkstra with a k stop limit",
  "RAG 評估流程",
  "reciprocal rank fusion",
  // Off-topic: should return few/no hits once the vector distance floor is on,
  // instead of the nearest top-k noise.
  "今天天氣如何",
];

async function one<T = Record<string, unknown>>(sql: string) {
  return (await query<T>(sql)).rows[0];
}

async function partA() {
  console.log("=== A · DB health ===");
  console.log("DATABASE_URL host:", new URL(env.DATABASE_URL).host);
  console.log("OPENAI_API_KEY set:", Boolean(env.OPENAI_API_KEY), "· EMBEDDING_MODEL:", env.EMBEDDING_MODEL);

  const ext = await one<{ v: boolean }>(`select exists(select 1 from pg_extension where extname='vector') as v`);
  console.log("pgvector installed:", ext?.v);

  const col = await one<{ v: boolean }>(
    `select exists(select 1 from information_schema.columns
       where table_name='knowledge_blocks' and column_name='embedding') as v`,
  );
  console.log("knowledge_blocks.embedding column exists:", col?.v);

  if (col?.v) {
    const counts = await one<{ total: number; with_emb: number; with_ctx: number }>(
      `select count(*)::int total,
              count(embedding)::int with_emb,
              count(*) filter (where metadata ? 'context')::int with_ctx
       from knowledge_blocks where status='active'`,
    );
    console.log(`active blocks: ${counts?.total}  ·  with embedding: ${counts?.with_emb}  ·  with context: ${counts?.with_ctx}`);
    if (counts && counts.total > 0 && counts.with_emb === 0) {
      console.log("⚠️  blocks exist but none are embedded — run `npm run backfill:embeddings` or reseed with OPENAI_API_KEY set.");
    }
    if (!ext?.v) {
      console.log("⚠️  vector search is OFF (no pgvector) — retrieval is keyword + concept only.");
    }
  } else {
    console.log("⚠️  no embedding column → vector search is disabled. Recreate the DB on the pgvector image (docker compose down -v).");
  }

  const cjk = await one<{ eng: string; sim: string }>(
    `select to_tsvector('english','二分搜尋的例子') eng, to_tsvector('simple','二分搜尋的例子') sim`,
  );
  console.log("CJK tsvector (english):", cjk?.eng);
  console.log("CJK tsvector (simple) :", cjk?.sim, "  ← whole run = one token (needs a CJK parser or vector)");
}

type SearchHit = { title: string | null; heading: string | null; rank: number; bodyMarkdown: string };

async function partB() {
  console.log("\n=== B · Probe queries (/search) ===");
  for (const q of probes) {
    try {
      const res = await fetch(`${baseUrl}/search?q=${encodeURIComponent(q)}&limit=3`);
      if (!res.ok) {
        console.log(`\n"${q}" → HTTP ${res.status}`);
        continue;
      }
      const { results } = (await res.json()) as { results: SearchHit[] };
      console.log(`\n"${q}" → ${results.length} hits`);
      results.forEach((r, i) => {
        const snippet = r.bodyMarkdown.replace(/\s+/g, " ").slice(0, 70);
        console.log(`  ${i + 1}. [${r.rank.toFixed(4)}] ${r.title} / ${r.heading ?? "-"} — ${snippet}…`);
      });
      if (!results.length) console.log("  (no hits)");
    } catch (error) {
      console.log(`\n"${q}" → server not reachable at ${baseUrl} (${(error as Error).message})`);
      break;
    }
  }

  console.log("\n=== B2 · One grounded answer (/ask) ===");
  try {
    const res = await fetch(`${baseUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "give me examples of binary search on answer" }),
    });
    if (res.ok) {
      const body = (await res.json()) as { answer: string; citations: { title: string }[] };
      console.log("answer:", body.answer);
      console.log("citations:", body.citations.map((c) => c.title).join(", ") || "(none)");
    } else {
      console.log(`/ask → HTTP ${res.status}`);
    }
  } catch (error) {
    console.log(`/ask → server not reachable (${(error as Error).message})`);
  }
}

async function run() {
  await partA();
  await partB();
}

run()
  .catch((error) => {
    console.error("verify failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
