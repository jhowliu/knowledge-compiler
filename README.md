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

Phase E adds optional `pgvector` search over approved `knowledge_blocks`.
Install the Postgres `vector` extension in the local database image if you want semantic search; without it, search continues to use full-text and concept ranking.

Backfill active blocks after enabling `pgvector`:

```bash
npm run backfill:embeddings --workspace=server
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
