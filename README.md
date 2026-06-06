# Knowledge Compiler

Interview Knowledge Compiler turns raw interview practice notes into structured knowledge, update proposals, mistake tracking, review tasks, and readiness maps.

## Stack

- Client: React, Vite, TypeScript
- Server: Express, TypeScript
- Database: self-hosted PostgreSQL
- DB access: `postgres` with hand-written SQL
- Agent runtime: OpenAI Agents SDK

## Local Setup

Install dependencies:

```bash
npm install
```

Create local env files if they are missing:

```bash
cp .env.example .env
cp client/.env.example client/.env
cp server/.env.example server/.env
```

Start Postgres:

```bash
docker compose up -d postgres
```

Apply migrations:

```bash
npm run migrate
```

Run the API:

```bash
npm run dev:server
```

Run the client:

```bash
npm run dev:client
```

The client runs on `http://localhost:5173`.

The API runs on `http://localhost:4000`.

## Hybrid Retrieval And Eval

ParadeDB `pg_search` powers BM25 keyword search and `pgvector` powers semantic
search over approved `knowledge_blocks`. The `docker compose` Postgres service
uses the pinned `paradedb/paradedb:0.23.4-pg16` image, which bundles both
extensions; `db/init/01-enable-retrieval-extensions.sql` enables available retrieval
extensions on first init, migration `015` adds `knowledge_blocks.embedding`, and
migration `020` adds the `knowledge_blocks_bm25_idx` index when `pg_search` is
available.

> Without the `vector` extension, `knowledge_blocks.embedding` is never created,
> `hasEmbeddingSupport()` returns false, and **vector search is silently disabled**
> — retrieval falls back to BM25/full-text + concept ranking only.
>
> Without the `pg_search` extension or `knowledge_blocks_bm25_idx`, BM25 is
> disabled and retrieval falls back to Postgres FTS + concept + optional vector.

If you previously ran the plain `postgres:16` or `pgvector/pgvector:pg16` image,
the existing data volume may not have `pg_search` and migration 020 may skip the
BM25 index. Recreate the volume so it initializes with ParadeDB retrieval
extensions (dev data is reconstructable from `seed-notes/`):

```bash
docker compose down -v
docker compose up -d postgres
npm run migrate
# repopulate the dev corpus through the real ingest -> compile -> approve pipeline:
npm run seed --workspace=server -- --yes
```

To embed any active blocks that are missing embeddings:

```bash
npm run backfill:embeddings --workspace=server
```

Verify the extension and column are present:

```bash
docker exec -it knowledge-compiler-postgres \
  psql -U knowledge -d knowledge_compiler \
  -c "select extname from pg_extension where extname in ('vector', 'pg_search');" \
  -c "select to_regclass('public.knowledge_blocks_bm25_idx') as bm25_index;" \
  -c "select count(embedding) as with_emb, count(*) as total from knowledge_blocks;"
```

Run the offline golden eval set:

```bash
npm run eval --workspace=server
```

To add an eval case, create a folder under `server/tests/fixtures/eval-cases/` with `source.md`, `expected.json`, and optional `meta.json` / `existing-block.md`. Keep `expected.json` focused on required concepts, forbidden hallucinations, conflict expectation, and minimum coverage/grounding scores.

## System Architecture

The system is a two-tier knowledge base: raw **sources** are preserved verbatim,
and an agent promotes the reusable parts into a canonical **knowledge** corpus
that retrieval answers from.

> Editable diagram: [`docs/architecture.excalidraw`](docs/architecture.excalidraw)
> — drag it into [excalidraw.com](https://excalidraw.com) or the desktop app
> (regenerate with `node docs/gen-architecture-excalidraw.mjs`).

### Storage tiers

| Tier | Tables | Role |
| --- | --- | --- |
| Source (provenance) | `raw_sources`, `raw_source_chunks` | Original ingested content, kept verbatim. Never destroyed. |
| Knowledge (canonical) | `knowledge_sources`, `knowledge_versions`, `knowledge_blocks`, `compiled_notes` | Deduped, versioned, retrievable knowledge. The corpus `/ask` grounds on. |
| Concept graph | `concepts`, `concept_index`, `note_links` | LLM-extracted concepts (note-level) and links between notes. |
| Provenance links | `knowledge_evidence` | Ties knowledge back to the source spans it came from. |

### Indexing layer — ingest → compile → approve

An agent reads each source, extracts structured facets, and **judges** whether it
should become knowledge. Only approved knowledge is chunked, contextualized, and
embedded.

```mermaid
flowchart TD
  ING["Ingest source<br/>POST /sources"] --> RS[("raw_sources<br/>raw_source_chunks")]
  ING --> CMP["Compile agent<br/>POST /sources/:id/compile"]
  CMP --> J{"Agent judgment<br/>ReAct loop + wiki indexer<br/>facets · concepts · conflict"}
  J -->|keep_searchable| KS["Stays a source only<br/>no knowledge block"]
  J -->|create / update_existing| PROP["Update proposal (pending)"]
  PROP --> APR["Human approve<br/>POST /update-proposals/:id/approve"]
  APR --> CH["Fixed-size chunk note<br/>~200 tokens, CJK-aware"]
  CH --> CTX["Per-chunk Contextual Retrieval<br/>LLM situating header → metadata.context"]
  CTX --> KB[("knowledge_blocks")]
  KB --> EMB["Embed (context + body)<br/>→ embedding (needs pgvector)"]
  APR --> CI[("concepts + concept_index<br/>note-level")]
  APR --> NL[("note_links · knowledge_evidence")]
```

### Retrieval layer — hybrid fusion + graph expansion

`/ask` and `/search` retrieve over `knowledge_blocks` by fusing three signals with
Reciprocal Rank Fusion, then expand one hop along the concept/link graph before
the answerer composes a scoped, cited answer.

```mermaid
flowchart TD
  Q["Query"] --> FTS["Postgres FTS<br/>(block-level fallback)"]
  Q --> BM25["BM25 pg_search<br/>(block-level, needs ParadeDB)"]
  Q --> QCON["Extract query concepts<br/>(LLM, optional)"]
  QCON --> CON["Canonical concept ids<br/>(note-level → blocks)"]
  Q --> E["Embed query"]
  E --> VEC["Vector cosine<br/>(block-level, needs pgvector)"]
  FTS --> RRF["RRF fusion (k=60)"]
  BM25 --> RRF
  CON --> RRF
  VEC --> RRF
  RRF --> HOP["One-hop graph expand<br/>approved note_links"]
  HOP --> TOP["Top-N blocks + citations"]
  TOP --> ANS["Answerer<br/>exact-question scoping prompt"]
  ANS --> OUT["Answer + citations"]
```

### Design philosophy

- **Two tiers, three separate axes.** *Provenance* (keep originals), *retrievability*
  (be findable), and *canonicalization* (be authoritative) are independent. Sources
  are preserved; knowledge is the curated, deduped layer.
- **Human-in-the-loop gates the corpus.** Nothing enters `knowledge_blocks` without
  an approved proposal, so retrieval answers from vetted material.
- **Agentic judgment protects quality.** The compile agent's keep / create / update /
  conflict decision keeps personal notes, TODOs, and contradicted drafts out of the
  authoritative corpus.
- **Mechanical boundaries, LLM for context.** Following Anthropic's Contextual
  Retrieval, chunk *boundaries* are mechanical (fixed-size); the LLM is spent on a
  per-chunk *situating context*, not on segmentation.
- **Hybrid retrieval, complementary granularities.** Query-side concept extraction
  resolves aliases/acronyms into canonical concept ids for global recall at *note*
  level; vector + contextual headers give local precision at *chunk* level; BM25
  covers exact lexical matches; Postgres FTS remains the built-in lexical fallback.
  RRF fuses them.

### Known gaps (tracked)

- `/search` now covers both tiers (knowledge-first, with `tier`-tagged raw sources, #143); `/ask` still grounds on `knowledge_blocks` only (labeled source fallback is a follow-up).
- Vector search requires pgvector, and BM25 requires pg_search plus
  `knowledge_blocks_bm25_idx`; missing capabilities are skipped with diagnostics.
  CJK full-text needs a segmenting parser (#144).
- Query-side concept extraction needs `OPENAI_API_KEY`; without it the concept
  signal is disabled and retrieval uses FTS + BM25 + optional vector.

## Server Architecture

The server follows a clean architecture-style folder split:

```text
server/src/controllers   HTTP request/response adapters
server/src/routes        Express route registration and route middleware
server/src/services      Application use cases and business flow
server/src/repositories  Persistence interfaces and SQL-backed implementations
server/src/domain        Shared domain types
server/src/middleware    Cross-cutting Express middleware
server/src/validators    Boundary validation schemas
server/src/db            Postgres client and migration runner
server/db/migrations     Versioned SQL migrations
server/tests             Service and validation tests
```

Routes should stay thin. Controllers should translate HTTP calls into service calls. Services should not contain raw SQL. Repositories own database queries.
