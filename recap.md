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
- Started Phase 2 Review Maps on `codex/phase-2-review-maps`.
- Added first-class review map listing through `GET /review-maps`.
- Improved the coding compiler so decision-guide notes like `Weight = 1 => BFS` become `review_map` compiled notes with structured decision rules, common traps, linked algorithms, and no fake mistake record.
- Updated the web canvas to load review maps from the API and show their decision rules in the Heptabase-like map card.
- Added server tests for review-map extraction/proposal behavior and the `/review-maps` dashboard route.
- Fixed the raw-note capture UX: the left-nav `Capture raw note` button now focuses the input form, and successful compile shows a visible confirmation message.
- Replaced the inline raw-note capture card with a dedicated dark raw-note editor page; clicking `Capture raw note` or `Raw notes` now navigates to that page.
- Made recent raw notes clickable in the raw-note editor and added an on-the-fly Markdown preview pane for the current draft or selected note.
- Added raw-note update, delete, and compile-existing APIs, then wired the editor Save/Delete/Compile saved controls to those endpoints.
- Added a dedicated Review Maps page on `codex/review-maps-page`, following the dark Heptabase-like workspace design: left review-map list, decision-rule detail table, source body, linked algorithms, related algorithm notes, and raw evidence.
- Simplified the old Knowledge Map UI into a Notes Network view: note list, selected-note center panel, bidirectional related-note links, agent link suggestions, raw evidence, and weak-area context.
- Adjusted the Notes Network again to be graph-first and easier to read: lightweight cards on a dotted canvas, connector lines from the focused card, and a right-side inspector that opens card content only after selection.
- Added app-wide light/dark theme support with a sidebar toggle; Notes Graph, Raw Notes, and Review Maps now render in both modes and persist the selected mode in local storage.

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
- Phase 2 keeps review maps high-level: they link out to algorithm notes instead of expanding every representative problem into the map.
- Knowledge graph UX should center on bidirectional note-to-note links and agent-maintained link suggestions instead of a complex spatial canvas.
- The first graph screen should keep cards minimal and defer dense content to the selected-card inspector.
- Theme mode is global UI state and should apply to every workspace page, not just the graph view.

## Open Issues
- Choose final auth library: Better Auth, Auth.js, or a minimal custom MVP auth.
- Decide whether the agent runtime runs inside the Express API process initially or in a separate worker service.
- Docker daemon status should be rechecked before relying on Docker Compose for local Postgres.
- OpenAI API key is intentionally blank in local env files.
- The shell had a global `DATABASE_URL` pointing at `admin@localhost:5432/sourect`; server config now loads project env files with override to avoid accidental cross-project DB usage.
- `AGENTS.md` exists locally and was used as convention guidance, but it has not been staged in this session.
- Vite may choose `5174` when `5173` is occupied; server CORS now allows localhost/127.0.0.1 dev origins on any port.
- The Pencil source file is named `deisgn.pen` in the repo and remains untracked unless intentionally added.
- A Vite process from before this phase was still running as PID 76042 during cleanup; the Phase 2 smoke-test dev servers were stopped.
- Local raw-note smoke tests inserted sample notes into the development database.
- Raw-note editor browser verification inserted another sample note into the development database.
- Raw-note CRUD browser verification created, edited, compiled, and deleted a throwaway note; its generated proposal remains in the development database.
- Review Maps browser verification inserted and approved a local sample note titled `Review map smoke: shortest path`.

## Next Target
- Add persistent `note_links` storage and approval/rejection flows for agent-suggested bidirectional links.
- Add review-map editing affordances such as manual rule cleanup, related-note pinning, and review-action tracking.
- Replace the deterministic compiler with an OpenAI Agents SDK-backed compiler when `OPENAI_API_KEY` is available.
- Add auth and user scoping before multi-user use.
- Add richer search filters and prevent current raw note from appearing in its own related-note list.
