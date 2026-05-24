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
- Implemented the Phase 1 Coding MVP loop: raw note capture, deterministic coding extraction, concept indexing, related-note lookup, update proposal generation, approval/rejection, compiled note writes, mistake tracking, review tasks, readiness map, and agent run events.
- Wired the React client to the Phase 1 API and smoke-tested note creation plus proposal approval in browser.
- Redesigned the client to follow the local `deisgn.pen` Heptabase-like workspace: dark left navigation, top toolbar, spatial knowledge canvas, evidence tray, and right AI proposal inspector.
- Added Tailwind CSS and `lucide-react` for the web UI implementation.

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
- Phase 1 compiler is deterministic/local for now so the MVP works without `OPENAI_API_KEY`; it preserves the proposal/agent-run boundary for later OpenAI Agents SDK integration.
- Web UI now uses Tailwind via `client/src/index.css`; old ad hoc `styles.css` was removed.

## Open Issues
- Choose final auth library: Better Auth, Auth.js, or a minimal custom MVP auth.
- Decide whether the agent runtime runs inside the Express API process initially or in a separate worker service.
- Docker daemon status should be rechecked before relying on Docker Compose for local Postgres.
- OpenAI API key is intentionally blank in local env files.
- The shell had a global `DATABASE_URL` pointing at `admin@localhost:5432/sourect`; server config now loads project env files with override to avoid accidental cross-project DB usage.
- `AGENTS.md` exists locally and was used as convention guidance, but it has not been staged in this session.
- Vite may choose `5174` when `5173` is occupied; server CORS now allows localhost/127.0.0.1 dev origins on any port.
- The Pencil source file is named `deisgn.pen` in the repo and remains untracked unless intentionally added.

## Next Target
- Replace the deterministic compiler with an OpenAI Agents SDK-backed compiler when `OPENAI_API_KEY` is available.
- Add auth and user scoping before multi-user use.
- Add richer search filters and prevent current raw note from appearing in its own related-note list.
