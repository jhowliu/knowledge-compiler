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

## Embeddings And Eval

`pgvector` powers semantic search over approved `knowledge_blocks`. The
`docker compose` Postgres service uses the `pgvector/pgvector:pg16` image, which
bundles the extension; `db/init/01-enable-pgvector.sql` enables it on first init
and migration `015` then adds the `knowledge_blocks.embedding` column.

> Without the `vector` extension, `knowledge_blocks.embedding` is never created,
> `hasEmbeddingSupport()` returns false, and **vector search is silently disabled**
> — retrieval falls back to full-text + concept ranking only.

If you previously ran the plain `postgres:16` image, the existing data volume has
no `vector` extension and migration 015 already ran (and skipped the column). Recreate
the volume so it initializes with pgvector (dev data is reconstructable from `seed-notes/`):

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
  -c "select extname from pg_extension where extname='vector';" \
  -c "select count(embedding) as with_emb, count(*) as total from knowledge_blocks;"
```

Run the offline golden eval set:

```bash
npm run eval --workspace=server
```

To add an eval case, create a folder under `server/tests/fixtures/eval-cases/` with `source.md`, `expected.json`, and optional `meta.json` / `existing-block.md`. Keep `expected.json` focused on required concepts, forbidden hallucinations, conflict expectation, and minimum coverage/grounding scores.

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
