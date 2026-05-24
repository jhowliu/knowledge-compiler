# Recap

## Summary
- Created `PRD.md` from the existing Interview Knowledge Compiler PRD.
- Added Section 34, Technical Specification, covering the agreed React + Express + self-hosted Postgres direction.
- Captured the no-ORM decision: use `pg` with hand-written SQL and plain migrations.
- Added agent runtime guidance using OpenAI Agents SDK, approval-gated durable writes, and an LLM-wiki concept index for related-note search.
- Added initial `client/` and `server/` project structure.
- Added root npm workspaces, local env examples, Docker Compose Postgres config, README setup instructions, and the first SQL migration.
- Configured Git remote `origin` as `https://github.com/jhowliu/knowledge-compiler.git`.
- Fixed migration env loading so project `.env` files override a global shell `DATABASE_URL`.
- Applied `001_initial.sql` successfully.
- Refactored the server toward the `AGENTS.md` clean architecture conventions: routes, controllers, services, repositories, middleware, validators, tests, and db migrations.
- Switched server tests to Jest and added raw-note service, schema, and route coverage.

## Decisions
- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn/ui.
- Backend: Express, TypeScript, `node-postgres` / `pg`.
- Database: self-hosted Postgres as source of truth.
- Folder split: `client/` for React and `server/` for Express.
- Search MVP: Postgres full-text search plus LLM-maintained concept index and note links.
- Later search: add `pgvector` only when fuzzy semantic retrieval is needed.
- Auth: app-owned auth/session model; do not use Codex CLI auth tokens.
- MVP DB access: no ORM; plain SQL migrations and query modules.
- Server feature files should use purpose suffixes such as `.routes.ts`, `.controller.ts`, `.service.ts`, and `.repository.ts`.
- Migrations now live under `server/db/migrations`, with `npm run migrate --workspace=server` as the preferred command.

## Open Issues
- Choose final auth library: Better Auth, Auth.js, or a minimal custom MVP auth.
- Decide whether the agent runtime runs inside the Express API process initially or in a separate worker service.
- Docker daemon status should be rechecked before relying on Docker Compose for local Postgres.
- OpenAI API key is intentionally blank in local env files.
- The shell had a global `DATABASE_URL` pointing at `admin@localhost:5432/sourect`; server config now loads project env files with override to avoid accidental cross-project DB usage.
- `AGENTS.md` exists locally and was used as convention guidance, but it has not been staged in this session.

## Next Target
- Continue raw note ingestion flow by wiring the React textarea to `POST /raw-notes`.
