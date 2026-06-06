# AGENTS.md

Guidelines for human and AI contributors to this repo.

## Stack

- **Monorepo** via npm workspaces: `client`, `server`
- **Client**: Vite + React (JS), Tailwind CSS v3, react-router-dom, axios
- **Server**: Node.js + Express (ESM), dotenv, cors
- **Infra (local)**: docker-compose with PostgreSQL 16, Redis 7, MinIO
- **Tooling**: ESLint (flat config), Prettier, Jest (server tests), SQL migration runner

## Repo Layout

```text
app/
├── client/
├── server/               # routes/ controllers/ middleware/ models/ services/
│   ├── db/migrations/    # versioned SQL migrations for server DB
│   └── scripts/migrate.js
├── scripts/
├── docker-compose.yml
├── .env.example
├── .prettierrc.json
└── package.json
```

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d
```

`minio-init` creates `meeting-files` and `meeting-audio` buckets and may exit after completion.

## Common Commands

| Task | Command |
|---|---|
| Dev client | `npm run dev --workspace=client` |
| Dev server | `npm run dev --workspace=server` |
| Build client | `npm run build --workspace=client` |
| Lint | `npm run lint` |
| Test (all workspaces) | `npm run test` |
| Test (server) | `npm run test --workspace=server` |
| Test DB-backed server cases | `npm run test:db --workspace=server` |
| Run server DB migrations | `npm run migrate --workspace=server` |
| Format check | `npm run format` |
| Format write | `npm run format:fix` |
| Stop infra | `docker compose down` |
| Stop + wipe volumes | `docker compose down -v` |

## Environment

- Copy `.env.example` to `.env` for local development
- Client only sees `VITE_*` vars
- Never commit `.env`
- `.env.example` is the source of truth for required env var names

## Database Migrations

- Use versioned SQL migrations in `server/db/migrations` (`0001_*.sql`, `0002_*.sql`, ...)
- Apply migrations with `npm run migrate --workspace=server`
- Migration state is tracked in `schema_migrations`
- Keep `scripts/postgres-init.sql` for extension/bootstrap concerns only (not feature table DDL)

## Workflow

- Read the ticket first
- Plan before coding
- Split work into small tasks
- Keep changes tightly scoped to the ticket
- Do not refactor unrelated areas unless asked
- When API endpoints, request bodies, response shapes, auth behavior, or query params change, update both `server/README.md` and `docs/postman/dost-meeting-mgnt.postman_collection.json`

## Server Architecture

Prefer this separation:

- **routes/**: register endpoints and middleware only
- **controllers/**: read request, call service, return response
- **services/**: business logic
- **models/repositories**: persistence and DB access
- **middleware/**: auth, validation, error handling

Do not put complex business logic or raw DB queries in route handlers.

## Express Conventions

- Use **ESM everywhere**
- Use `import`/`export`, never `require`
- Keep route files thin
- Validate input before controller logic
- Use centralized error handling
- Prefer async/await
- Pass operational errors to error middleware consistently

Example:

```js
router.post('/meetings', validate(createMeetingSchema), meetingController.create)
```

## Validation Rules

Validate all external input:

- `req.body`
- `req.params`
- `req.query`
- headers when relevant

Guidelines:

- Validate at the API boundary
- Use explicit schemas
- Reject malformed input early with `400`
- Keep schemas near the feature/domain
- Sanitize where appropriate: trim strings, normalize emails, strip unknown fields if needed
- Never trust frontend validation alone

## Error Handling

Use centralized error middleware with consistent responses.

Suggested categories:

- `400` validation error
- `401` unauthenticated
- `403` unauthorized
- `404` not found
- `409` conflict
- `500` unexpected server error

Do not leak stack traces or secrets in production responses.

## Testing Guidelines

Every behavior change should include tests unless it is purely non-functional.

### Unit tests
Use for:
- services
- utilities
- validation helpers
- pure business rules

### Integration tests
Use for:
- route + middleware + controller flow
- validation behavior
- auth behavior
- DB interaction
- error response contracts

### Minimum for new endpoints
Test at least:
- success case
- validation failure
- auth failure if protected
- not found case if applicable

### Test style
- Prefer clear test names
- Keep fixtures small
- Avoid shared mutable state
- Clean up DB state between tests
- Use Jest for server tests (`server/tests/*.test.js`)

Example:

```js
describe('POST /meetings', () => {
  it('returns 201 for valid payload', () => {})
  it('returns 400 for invalid payload', () => {})
})
```

## Code Conventions

- Prettier is the source of truth for formatting
- Do not hand-format code
- Run `npm run format:fix`
- Rules: no semicolons, single quotes, trailing commas `es5`, print width 100
- ESLint is for correctness, not style
- No comments that only restate the code
- Write comments only when the reasoning is non-obvious
- No new top-level docs unless asked

## Coding Style

### Naming
- Use `camelCase` for variables and functions
- Use `PascalCase` for React components and class-like constructs
- Use `UPPER_SNAKE_CASE` for true constants
- Prefer descriptive names over short abbreviations
- Use consistent endpoint, service, and file naming across features

### Files and Modules
- Keep files focused on one responsibility
- Prefer one main export per file when practical
- Name files by purpose: `meeting.controller.js`, `meeting.service.js`, `meeting.routes.js`
- Avoid large utility dumping-ground files

### Functions
- Keep functions small and single-purpose
- Prefer early returns over deep nesting
- Prefer explicit inputs and outputs
- Avoid hidden side effects where possible
- Extract repeated logic instead of copying blocks

### Express and API Style
- Keep controllers thin and services focused
- Return consistent JSON response shapes
- Use HTTP status codes deliberately
- Do not mix validation, persistence, and response formatting in one function
- Prefer middleware for cross-cutting concerns

### React Style
- Prefer small reusable components
- Keep component state close to where it is used
- Avoid deeply nested prop drilling when a cleaner shared pattern exists
- Keep presentational and data-fetching concerns reasonably separated
- Use Tailwind CSS utility classes for client-side styling
- Do not add native CSS, inline `<style>` blocks, or ad hoc stylesheet files for React UI
- Keep `client/src/index.css` limited to Tailwind entrypoint/global baseline concerns
- For print/PDF preview UI, render a React component styled with Tailwind and print utilities instead of writing raw HTML with embedded CSS

### Imports
- Group imports consistently
- Remove unused imports
- Prefer absolute or established repo import style if already configured
- Avoid circular dependencies

### Comments
- Comment the why, not the obvious what
- Use comments sparingly
- Delete outdated comments when code changes

### Readability
- Prefer straightforward code over clever shortcuts
- Avoid deeply nested conditionals
- Break complex logic into named helpers
- Optimize for maintainability first, micro-optimizations second unless profiling shows otherwise

## Security

- Validate all input
- Do not log secrets, tokens, passwords, or sensitive personal data
- Apply auth/authorization checks explicitly
- Treat uploads and file handling as high risk
- Keep config/env access centralized where possible

## Git & PR Workflow

### Branches
Use the exact Linear branch name:

```text
jhowliu/dos-<NN>-<slugified-title>
```

### Commits
Prefix commit subjects with the ticket ID:

```text
DOS-33: scaffold monorepo and env setup
```

For multi-line commits, use HEREDOC and include:

```text
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Rules:
- Do not amend published commits
- Do not use `--no-verify`
- Fix the cause and commit again

### Pull Requests
- Title must start with ticket ID: `DOS-NN: <summary>`
- Body must mention every closed ticket ID
- Use sections:
  - `## Summary`
  - `## Changes`
  - `## Test plan`
- Move ticket to:
  - **In Progress** when starting
  - **In Review** when PR is open
  - **Done** on merge

## Lockfile Conflicts

If parallel workspace work causes `package-lock.json` conflicts:

```bash
git fetch origin
git rebase origin/main
git checkout --ours package-lock.json
rm -rf node_modules && npm install
git add package-lock.json
git rebase --continue
git push --force-with-lease origin HEAD
```

Rules:
- Never force-push without `--force-with-lease`
- Never force-push to `main`

## Gotchas

- `gh` auth: a global `GITHUB_TOKEN` may point to another account; run `source ~/.zshrc` before `gh` commands
- `docker-compose.yml` uses vars from `.env`; missing `.env` may produce warnings during config checks
- Tailwind is **v3**, not v4
- `.claude/` is scratch space, gitignored, and must not be relied on

## Done Checklist

Before finishing, verify:

- [ ] Change is scoped to the ticket
- [ ] Routes stay thin
- [ ] Input validation exists where needed
- [ ] Business logic is in services
- [ ] Errors are handled consistently
- [ ] Tests were added or updated
- [ ] No sensitive data is logged
- [ ] Formatting and linting pass
- [ ] Docs/env usage updated if behavior changed

## Priority Order

When making decisions, follow:

1. Existing repo conventions
2. This file
3. General Express/React best practices
