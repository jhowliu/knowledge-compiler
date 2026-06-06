#!/usr/bin/env bash
# Prerequisites: gh auth login, run from any directory
# Usage: bash create-issues.sh jhowliu/knowledge-compiler

REPO=${1:-"jhowliu/knowledge-compiler"}

echo "Creating labels for $REPO..."

gh label create "phase-a"        --repo "$REPO" --color "0075ca" --description "Foundation: migrations and topics" --force
gh label create "phase-b"        --repo "$REPO" --color "7057ff" --description "Agentic compile: ReAct loop and eval judge" --force
gh label create "phase-c"        --repo "$REPO" --color "008672" --description "RAG: /ask endpoint" --force
gh label create "phase-d"        --repo "$REPO" --color "e4e669" --description "Polish: conflict UI, eval UI, cleanup" --force
gh label create "phase-e"        --repo "$REPO" --color "d93f0b" --description "Phase 2: pgvector and golden set" --force
gh label create "database"       --repo "$REPO" --color "bfd4f2" --description "Schema or migration change" --force
gh label create "api"            --repo "$REPO" --color "bfd4f2" --description "API endpoint change" --force
gh label create "ui"             --repo "$REPO" --color "bfd4f2" --description "Frontend change" --force
gh label create "agent"          --repo "$REPO" --color "d4c5f9" --description "Agent runtime or tools" --force
gh label create "contracts"      --repo "$REPO" --color "d4c5f9" --description "Tool I/O schemas and contracts" --force
gh label create "rag"            --repo "$REPO" --color "c2e0c6" --description "Retrieval and question answering" --force
gh label create "search"         --repo "$REPO" --color "c2e0c6" --description "Search architecture" --force
gh label create "eval"           --repo "$REPO" --color "f9d0c4" --description "Extraction evaluation" --force
gh label create "testing"        --repo "$REPO" --color "f9d0c4" --description "Tests and fixtures" --force
gh label create "breaking-change" --repo "$REPO" --color "e11d48" --description "Breaks existing behaviour" --force

echo "✓ Labels created"
echo ""
echo "Creating issues for $REPO..."

# ─── Phase A: Foundation ───────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase A] Migration 008: replace domain enum with topics table" \
  --label "phase-a,database,breaking-change" \
  --body "## Summary
Replace the hardcoded \`domain\` enum on \`raw_sources\`, \`compiled_notes\`, and \`knowledge_blocks\` with a free-form user-owned \`topics\` table.

## Motivation
The current \`domain\` enum is hardcoded to interview preparation categories (\`coding\`, \`system_design\`, \`behavioral\`). The product is now a general-purpose notes system. Domain should be user-defined free-form tags.

## Schema changes

\`\`\`sql
CREATE TABLE topics (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE source_topics (
  source_id  uuid NOT NULL REFERENCES raw_sources(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, topic_id)
);

CREATE TABLE block_topics (
  block_id   uuid NOT NULL REFERENCES knowledge_blocks(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  confidence text NOT NULL DEFAULT 'high' CHECK (confidence IN ('high','medium','low')),
  source     text NOT NULL DEFAULT 'user' CHECK (source IN ('user','llm')),
  PRIMARY KEY (block_id, topic_id)
);

-- Migrate existing domain values to topics rows
INSERT INTO topics (user_id, name)
SELECT DISTINCT user_id, domain FROM raw_sources WHERE domain IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO source_topics (source_id, topic_id)
SELECT rs.id, t.id FROM raw_sources rs
JOIN topics t ON t.user_id = rs.user_id AND t.name = rs.domain
WHERE rs.domain IS NOT NULL;

-- Keep domain columns as nullable fallback (dropped in migration 010)
ALTER TABLE raw_sources     ALTER COLUMN domain DROP NOT NULL;
ALTER TABLE compiled_notes  ALTER COLUMN domain DROP NOT NULL;
ALTER TABLE knowledge_blocks ALTER COLUMN domain DROP NOT NULL;
\`\`\`

## Acceptance criteria
- [ ] Migration runs cleanly on a database with existing domain values
- [ ] All existing domain values are migrated to user-owned topic rows
- [ ] domain columns remain nullable (not dropped yet — that is migration 010)
- [ ] \`GET /topics\`, \`POST /topics\`, \`PATCH /topics/:id\`, \`DELETE /topics/:id\` endpoints work
- [ ] New code does not write to \`domain\` columns — uses \`topic_ids\` instead

## Notes
- Do NOT drop domain columns in this migration — migration 010 does that after the app layer is fully migrated
- Stop writing to \`domain\` in any new service or repository code from this point forward"

echo "✓ Issue 1 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase A] Migration 009: add subtype to raw_sources" \
  --label "phase-a,database" \
  --body "## Summary
Add a nullable \`subtype\` text column to \`raw_sources\` for free-form source classification.

## Motivation
\`source_role\` is a binary ('personal_note' | 'reference') that doesn't capture nuance. A book note, a research paper, and a journal entry are all 'personal_note' but benefit from further classification without hardcoding more enums.

## Schema change

\`\`\`sql
ALTER TABLE raw_sources ADD COLUMN subtype text;
-- e.g. 'book_note', 'research_paper', 'lecture_note', 'journal_entry', null
\`\`\`

## Acceptance criteria
- [ ] Migration runs cleanly
- [ ] \`subtype\` is nullable — existing rows unaffected
- [ ] \`POST /sources\` and \`PATCH /sources/:id\` accept optional \`subtype\` field
- [ ] \`subtype\` is returned in \`GET /sources/:id\` response"

echo "✓ Issue 2 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase A] Migration 011: add extraction_evals table" \
  --label "phase-a,database" \
  --body "## Summary
Create the \`extraction_evals\` table to store eval judge results for each agent run.

## Schema

\`\`\`sql
CREATE TABLE extraction_evals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id     uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  source_id        uuid NOT NULL REFERENCES raw_sources(id) ON DELETE CASCADE,
  verdict          text NOT NULL CHECK (verdict IN ('pass', 'warn', 'fail')),
  coverage_score   numeric(4,3),
  grounding_score  numeric(4,3),
  warnings         jsonb,
  raw_judge_output jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON extraction_evals (agent_run_id);
CREATE INDEX ON extraction_evals (source_id);
\`\`\`

## warnings jsonb structure
\`\`\`json
[
  {
    \"type\": \"missing_concept\" | \"ungrounded\" | \"missed_conflict\" | \"too_coarse\" | \"low_coverage\",
    \"message\": \"string\",
    \"severity\": \"high\" | \"medium\",
    \"affected_item_index\": 0
  }
]
\`\`\`

## Acceptance criteria
- [ ] Migration runs cleanly
- [ ] Table exists with correct columns and constraints
- [ ] Indexes on agent_run_id and source_id created"

echo "✓ Issue 3 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase A] Topics CRUD API and UI picker" \
  --label "phase-a,api,ui" \
  --body "## Summary
Implement the Topics CRUD API and replace the domain dropdown in the UI with a topic multi-select picker.

## API endpoints

\`\`\`
GET    /topics              list all topics for current user
POST   /topics              create a topic { name, color? }
PATCH  /topics/:id          rename or recolor
DELETE /topics/:id          only if no sources or blocks reference it
\`\`\`

## UI changes
- Remove domain dropdown from source editor and source creation form
- Add topic multi-select picker (type to search existing, press Enter to create new)
- Show topic pills on source cards in the Sources sidebar

## Acceptance criteria
- [ ] Full CRUD for topics works
- [ ] DELETE /topics/:id returns 409 if topic has associated sources or blocks
- [ ] UI topic picker supports: selecting existing topics, creating new topics inline, removing topics
- [ ] Topics persist correctly on source save
- [ ] No new code writes to the legacy \`domain\` column

## Depends on
Migration 008"

echo "✓ Issue 4 created"

# ─── Phase B: Agentic compile ─────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase B] packages/agent-contracts: Zod schemas for all tool I/O" \
  --label "phase-b,agent,contracts" \
  --body "## Summary
Create a \`packages/agent-contracts\` package with Zod schemas and TypeScript types for all 6 agent tools and the eval judge.

## Tools to define
1. \`get_source\` — input: \`{ source_id }\`, output: source + chunks
2. \`search_blocks\` — input: \`{ query, topic_ids?, limit?, include_archived? }\`, output: ranked results
3. \`get_block\` — input: \`{ block_id }\`, output: full block + evidence + links
4. \`lookup_concepts\` — input: \`{ concepts[], fuzzy? }\`, output: matches with canonical labels
5. \`get_block_history\` — input: \`{ block_id, limit? }\`, output: version list
6. \`draft_proposal\` — input: \`{ reasoning_summary, incomplete_reasoning, items[], suggested_links[] }\`

## ProposalItem fields (critical)
\`\`\`typescript
{
  action: 'upsert_knowledge' | 'create_knowledge',
  target_block_id: string | null,
  title: string,
  body_markdown: string,
  source_concept_ids: string[],
  source_spans: [{          // ← must have at least one
    chunk_index: number,
    char_start: number,
    char_end: number,
    text: string            // verbatim substring of chunk
  }],
  confidence: 'high' | 'medium' | 'low',
  conflict_detected: boolean,
  conflict_summary: string | null,
  conflict_resolution: 'update' | 'keep_both' | 'needs_user_decision' | null
}
\`\`\`

## Eval judge schemas
- \`JudgeInput\` — source text + chunks + proposal + existing blocks context
- \`JudgeOutput\` — coverage + grounding + conflict_review + verdict + warnings
- \`EvalWarning\` — typed warning with severity

## Acceptance criteria
- [ ] All 6 tool input/output schemas defined as Zod schemas
- [ ] \`ProposalItem\` and \`SuggestedLink\` schemas defined
- [ ] \`JudgeInput\` and \`JudgeOutput\` schemas defined
- [ ] TypeScript types exported from schemas
- [ ] Runtime validation: tool input failure → \`tool_schema_violation\` error; output failure → \`tool_output_invalid\` error
- [ ] \`source_spans[].text\` validated as verbatim substring of its chunk at runtime (string match, not LLM)
- [ ] Package importable from server services

## Full schema reference
See \`agent-tool-contracts.md\` in the repo root."

echo "✓ Issue 5 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase B] Implement 6 agent tools as typed service functions" \
  --label "phase-b,agent" \
  --body "## Summary
Implement each of the 6 agent tools as typed TypeScript service functions, validated against the Zod schemas from \`packages/agent-contracts\`.

## Tools

### \`get_source(source_id)\`
- Load raw_sources row + all raw_source_chunks ordered by index
- Return typed output matching \`GetSourceOutput\` schema

### \`search_blocks(query, opts)\`
- FTS on knowledge_blocks.body_markdown + concept_index matches
- RRF merge, return top-K summaries (not full content)
- Include linked_block_ids from approved note_links

### \`get_block(block_id)\`
- Full knowledge_blocks row
- All evidence_links for this block
- All approved note_links from/to this block

### \`lookup_concepts(concepts[], fuzzy?)\`
- Exact match first against concept_index.concept
- If fuzzy=true and no exact match: embedding similarity fallback (or FTS if no embeddings yet)
- Return canonical label + linked block IDs

### \`get_block_history(block_id, limit?)\`
- knowledge_versions ordered by version_number desc
- Return version list with body_markdown snapshots

### \`draft_proposal(input)\`
- Validate input against \`DraftProposalInput\` Zod schema
- Validate each \`source_spans[].text\` is a verbatim substring of its chunk
- Items failing span validation are marked \`ungrounded\` before saving
- Save to update_proposals + proposal_items
- Return \`{ proposal_id, item_count, link_count, saved_at }\`

## Acceptance criteria
- [ ] All 6 tools implemented as pure service functions (no side effects except draft_proposal)
- [ ] All inputs/outputs validated with Zod schemas from agent-contracts package
- [ ] \`source_spans\` verbatim check in draft_proposal
- [ ] Unit tests for each tool function
- [ ] \`get_block_history\` is a new function (does not exist in current codebase)

## Depends on
Issues: packages/agent-contracts Zod schemas, Migration 011"

echo "✓ Issue 6 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase B] Rewrite compile_raw_source as ReAct loop" \
  --label "phase-b,agent,breaking-change" \
  --body "## Summary
Replace the current linear 6-step \`compile_raw_source\` pipeline with a ReAct (Reason + Act + Observe) loop.

## Current behaviour (to replace)
\`\`\`
raw_source_loaded → detection_completed → wiki_index_drafted →
related_knowledge_found → proposal_created → run_completed
\`\`\`
This is a fixed sequence. The LLM has no agency over which tools to call or how many times.

## New behaviour: ReAct loop

\`\`\`
Entry: load source (get_source, always first)

Loop (max 8 rounds, max 3 calls per tool):
  Think: LLM reads context, decides next tool call
  Act:   LLM calls one tool
  Observe: runner executes tool, appends result to context

Exit: LLM calls draft_proposal (ends loop immediately)
   OR: round limit reached → exit with incomplete_reasoning: true
\`\`\`

## LLM must be able to:
- Call search_blocks multiple times with different queries
- Call get_block to read full content of a search result
- Call get_block_history when it suspects a contradiction
- Call lookup_concepts before creating a new block
- Decide upsert vs create based on what it finds
- Set conflict_detected: true with conflict_summary when contradiction found
- Call draft_proposal exactly once as its final action

## System prompt requirements
- ReAct reasoning instructions (think before acting, observe before next think)
- Tool descriptions and when to use each
- Explicit instruction: call lookup_concepts before creating blocks
- Explicit instruction: call get_block_history when contradiction suspected
- Explicit instruction: source_spans required on every ProposalItem
- Explicit instruction: draft_proposal is final, called exactly once
- User's topics list and recent concept_index entries as context
- No hardcoded domain names or interview-specific schemas

## Guardrails (enforced by runner, not LLM)
- Max 8 tool call rounds per run
- Max 3 calls to the same tool per run
- draft_proposal terminates loop immediately
- Any tool call after draft_proposal is rejected
- If round limit reached: set incomplete_reasoning: true on all items, exit

## Agent run events to emit
- \`react_loop_started\`
- \`tool_called { tool, input, round }\`
- \`tool_result { tool, output_summary, round }\`
- \`loop_exited { reason: 'draft_proposal' | 'round_limit' }\`
- \`run_completed\`

## Acceptance criteria
- [ ] compile_raw_source runs ReAct loop (not linear pipeline)
- [ ] LLM can call any tool in any order, any number of times (within limits)
- [ ] Guardrails enforced by runner
- [ ] incomplete_reasoning: true set when round limit hit
- [ ] All loop steps recorded in agent_run_events
- [ ] System prompt has no hardcoded domain references
- [ ] Integration test: compile a note with a contradiction → conflict_detected: true in proposal

## Depends on
Issues: Zod schemas, 6 agent tools, proposal_items schema changes"

echo "✓ Issue 7 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase B] Add source_spans and conflict_detected to proposal_items" \
  --label "phase-b,database,agent" \
  --body "## Summary
Add \`source_spans jsonb\`, \`conflict_detected boolean\`, \`conflict_summary text\`, and \`conflict_resolution text\` columns to \`proposal_items\`.

## Schema changes

\`\`\`sql
ALTER TABLE proposal_items
  ADD COLUMN source_spans        jsonb,
  ADD COLUMN conflict_detected   boolean NOT NULL DEFAULT false,
  ADD COLUMN conflict_summary    text,
  ADD COLUMN conflict_resolution text CHECK (
    conflict_resolution IN ('update', 'keep_both', 'needs_user_decision')
  ),
  ADD COLUMN eval_verdict        text CHECK (eval_verdict IN ('pass', 'warn', 'fail')),
  ADD COLUMN incomplete_reasoning boolean NOT NULL DEFAULT false;
\`\`\`

## source_spans structure
\`\`\`json
[{
  \"chunk_index\": 0,
  \"char_start\": 42,
  \"char_end\": 180,
  \"text\": \"verbatim passage from source chunk\"
}]
\`\`\`

## Constraints
- Items where source_spans is empty or null are considered ungrounded
- conflict_detected: true requires conflict_summary to be non-null (enforced at application layer)
- conflict_resolution required when conflict_detected is true

## Acceptance criteria
- [ ] Migration runs cleanly on existing data (new columns nullable/defaulted, existing rows unaffected)
- [ ] draft_proposal service writes source_spans and conflict fields correctly
- [ ] Verbatim span check runs before proposal is saved
- [ ] Items failing span check have eval_verdict set to 'fail' immediately"

echo "✓ Issue 8 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase B] Eval judge service" \
  --label "phase-b,agent" \
  --body "## Summary
Implement the eval judge as a separate LLM call that runs after \`draft_proposal\` and before the proposal is written to the review inbox.

## Position in pipeline
\`\`\`
draft_proposal called
  → verbatim span check (runtime, not LLM)
  → eval judge LLM call  ← this issue
  → extraction_evals row written
  → proposal saved to update_proposals with eval_verdict per item
  → run_completed
\`\`\`

## Judge inputs
- Full source text and chunks
- Complete draft proposal (all ProposalItems)
- Brief context on existing blocks referenced in the proposal

## Judge outputs (structured, Zod-validated)
\`\`\`typescript
{
  coverage: {
    expected_concepts: [{ label: string, reason: string }],
    missing_from_proposal: string[],
    score: number  // 0.0–1.0
  },
  grounding: [{
    item_index: number,
    verdict: 'grounded' | 'weak' | 'ungrounded',
    reason: string | null
  }],
  conflict_review: [{
    item_index: number,
    acknowledged: boolean,
    missed_conflict: string | null
  }],
  overall_verdict: 'pass' | 'warn' | 'fail',
  warnings: EvalWarning[],
  summary: string
}
\`\`\`

## Verdict rules
| Condition | Verdict |
|---|---|
| All grounded, coverage ≥ 0.7, no missed conflicts | pass |
| Any weak OR coverage 0.5–0.69 OR too_coarse | warn |
| Any ungrounded OR coverage < 0.5 OR missed_conflict | fail |

## Key behaviours
- Use a smaller/cheaper model (e.g. haiku) — does not need full indexer capability
- fail verdict does NOT block the proposal — saves with eval_verdict = 'fail' per affected item
- Verbatim grounding check already happened before judge runs — judge only checks semantic grounding for items that passed the string match
- Write results to extraction_evals table

## Acceptance criteria
- [ ] Eval judge runs after every draft_proposal
- [ ] Judge uses a separate, configurable model (EVAL_JUDGE_MODEL env var)
- [ ] JudgeOutput validated with Zod schema
- [ ] extraction_evals row written for every run
- [ ] eval_verdict set on each affected proposal_item
- [ ] fail verdict does not prevent proposal from being saved
- [ ] Unit tests for verdict rule logic

## Depends on
Issues: Zod schemas, extraction_evals migration, source_spans on proposal_items"

echo "✓ Issue 9 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase B] Prompt version tracking in agent_runs.metadata" \
  --label "phase-b,agent" \
  --body "## Summary
Record prompt versions and model names in \`agent_runs.metadata\` for every compile run, enabling prompt regression analysis.

## Changes

### Schema (if metadata column doesn't exist)
\`\`\`sql
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS metadata jsonb;
\`\`\`

### Metadata written on every compile_raw_source run
\`\`\`json
{
  \"indexer_prompt_version\": \"1.0.0\",
  \"judge_prompt_version\": \"1.0.0\",
  \"tool_contract_version\": \"1.0.0\",
  \"model\": \"claude-sonnet-4-20250514\",
  \"judge_model\": \"claude-haiku-4-5-20251001\"
}
\`\`\`

### Versioning policy
- Bump \`indexer_prompt_version\` on any change to the ReAct system prompt
- Bump \`judge_prompt_version\` on any change to the eval judge prompt
- Bump \`tool_contract_version\` when agent-tool-contracts.md schemas change

### Where versions are defined
- Prompt version constants live in \`server/src/agents/versions.ts\`
- Model names come from env vars: \`INDEXER_MODEL\`, \`EVAL_JUDGE_MODEL\`

## Acceptance criteria
- [ ] Every compile_raw_source run writes metadata with all 5 fields
- [ ] Prompt version constants in a single file (easy to bump)
- [ ] \`GET /agent-runs/:id\` response includes metadata
- [ ] Can query agent_runs by indexer_prompt_version to compare eval scores across prompt versions"

echo "✓ Issue 10 created"

# ─── Phase C: RAG ─────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase C] POST /ask RAG endpoint with source citations" \
  --label "phase-c,api,rag" \
  --body "## Summary
Implement the \`POST /ask\` endpoint — take a natural language question, retrieve relevant knowledge blocks, and return an answer grounded in the user's own knowledge base with source citations.

## Request
\`\`\`typescript
POST /ask
{
  query: string,
  topic_ids?: string[]   // optional filter
}
\`\`\`

## Response
\`\`\`typescript
{
  answer: string,
  citations: [{
    block_id: string,
    title: string,
    chunk_text: string,       // the passage that supported this claim
    source_note_title: string,
    source_note_id: string
  }]
}
\`\`\`

## Pipeline
1. Hybrid search on knowledge_blocks: FTS + concept_index, RRF merge
2. Graph traversal: for top-K results, pull in approved note_links (1 hop)
3. Deduplicate and rank final block list
4. Build context window: block title + body + evidence source titles
5. LLM call: answer the question grounded strictly in retrieved blocks
6. Return answer + citations

## LLM instructions for answer generation
- Answer only from retrieved blocks — do not infer or synthesize beyond them
- If blocks don't contain enough information, say so explicitly
- Each claim should be attributable to a specific block

## Acceptance criteria
- [ ] Endpoint returns answer + citations for a query with matching knowledge blocks
- [ ] Returns graceful 'not enough information' response when no relevant blocks found
- [ ] topic_ids filter correctly narrows the search corpus
- [ ] Citations include block_id, chunk_text, and source note reference
- [ ] No hallucinated content in answers (manual QA with test queries)

## Depends on
Issues: ReAct loop (knowledge blocks must be populated)"

echo "✓ Issue 11 created"

# ─── Phase D: Polish ──────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase D] Conflict detection UI in Review Inbox" \
  --label "phase-d,ui" \
  --body "## Summary
Surface \`conflict_detected\` proposals in the Review Inbox with an orange warning badge and require explicit user acknowledgement before approving items where \`conflict_resolution = 'needs_user_decision'\`.

## UI changes

### Conflict badge on proposal items
- Items with \`conflict_detected: true\` show an orange badge
- Badge text: 'Conflict detected'
- Expanding the item shows \`conflict_summary\` text

### Acknowledgement gate for needs_user_decision
- Items with \`conflict_resolution = 'needs_user_decision'\` have Approve button disabled by default
- A checkbox: 'I have read the conflict summary and understand the implications'
- Checking the box enables the Approve button
- These items are excluded from 'Approve all' bulk action

### Conflict resolution label
- Items with \`conflict_resolution = 'update'\` show a blue 'Will update existing block' label
- Items with \`conflict_resolution = 'keep_both'\` show a gray 'Will create alongside existing block' label

## Acceptance criteria
- [ ] conflict_detected items show orange badge
- [ ] conflict_summary displayed in expanded item view
- [ ] needs_user_decision items require checkbox acknowledgement before approving
- [ ] needs_user_decision items excluded from Approve all
- [ ] conflict_resolution label shown on relevant items

## Depends on
Issues: ReAct loop (conflict_detected field in proposals)"

echo "✓ Issue 12 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase D] Eval verdict badge in Review Inbox" \
  --label "phase-d,ui" \
  --body "## Summary
Show the eval judge verdict (pass / warn / fail) on each proposal item in the Review Inbox.

## UI changes

### Verdict badge per proposal item
- \`pass\`: small green checkmark badge, collapsed by default
- \`warn\`: yellow warning badge, expandable to show warnings list
- \`fail\`: red badge, expanded by default showing warnings + explicit acknowledgement required

### Expanded warnings view
For warn/fail items, show:
- Coverage score (e.g. 'Covered 4 of 6 expected concepts')
- List of EvalWarning items with type + message
- For ungrounded items: which specific ProposalItem is affected
- Raw judge summary text

### fail acknowledgement
Similar to conflict needs_user_decision: fail items require a checkbox before Approve is enabled.
Checkbox text: 'I have reviewed the eval warnings and accept this proposal'

### GET /agent-runs/:id/eval-result endpoint
New endpoint that returns the full extraction_evals row for a given agent run, used by the drawer.

## Acceptance criteria
- [ ] Verdict badge shown on every proposal item
- [ ] pass badge is unobtrusive (small, collapsed)
- [ ] warn badge is expandable
- [ ] fail badge is expanded by default with acknowledgement gate
- [ ] GET /agent-runs/:id/eval-result endpoint returns extraction_evals data
- [ ] Warnings list is human-readable (not raw JSON)

## Depends on
Issues: Eval judge service"

echo "✓ Issue 13 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase D] Migration 010: drop legacy domain columns" \
  --label "phase-d,database,breaking-change" \
  --body "## Summary
Drop the legacy \`domain\` columns after the application layer is fully migrated to the topics system.

## ⚠️ Run this migration last in Phase D
Only run after:
- Migration 008 is applied
- All API endpoints use topic_ids instead of domain
- UI has no domain dropdowns remaining
- No service/repository code reads or writes the domain column

## Schema changes
\`\`\`sql
ALTER TABLE raw_sources      DROP COLUMN domain;
ALTER TABLE raw_notes        DROP COLUMN IF EXISTS domain;
ALTER TABLE compiled_notes   DROP COLUMN IF EXISTS domain;
ALTER TABLE knowledge_blocks DROP COLUMN IF EXISTS domain;
DROP TYPE IF EXISTS interview_domain;
\`\`\`

## Pre-migration checklist
- [ ] grep codebase for any remaining domain column reads/writes — must be zero
- [ ] All API responses that included domain field updated to use topics array
- [ ] UI has no references to domain field

## Acceptance criteria
- [ ] Migration runs without error
- [ ] No domain columns remain in any table
- [ ] interview_domain enum type dropped
- [ ] Application still works correctly after column removal (topics fully in use)"

echo "✓ Issue 14 created"

# ─── Phase E: Phase 2 search ─────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase E] pgvector: add embeddings to knowledge_blocks" \
  --label "phase-e,database,search" \
  --body "## Summary
Add a \`vector(1536)\` embedding column to \`knowledge_blocks\`, populate embeddings on proposal approval, and update search to use three-way RRF (FTS + concept index + cosine similarity).

## Schema change
\`\`\`sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE knowledge_blocks ADD COLUMN embedding vector(1536);
CREATE INDEX ON knowledge_blocks USING ivfflat (embedding vector_cosine_ops);
\`\`\`

## Embedding generation
- On \`POST /update-proposals/:id/approve\`: after writing the new knowledge_versions row, generate embedding for the block's body_markdown and store in knowledge_blocks.embedding
- Use the same model as configured for indexer (or a dedicated embedding model via EMBEDDING_MODEL env var)
- Blocks approved before this feature are backfilled via a one-time script

## Search update
\`\`\`
POST /search:
  1. FTS score (existing)
  2. Concept index score (existing)
  3. Cosine similarity: embed query → search by embedding ← new
  4. Three-way RRF merge

POST /ask:
  Same update
\`\`\`

## Backfill script
\`\`\`
npm run backfill:embeddings --workspace=server
\`\`\`
Generates embeddings for all active knowledge_blocks where embedding IS NULL.

## Acceptance criteria
- [ ] embedding column added with ivfflat index
- [ ] Embeddings generated on approval
- [ ] Backfill script works for existing blocks
- [ ] /search uses three-way RRF when embeddings available
- [ ] /ask uses three-way RRF when embeddings available
- [ ] Search results are meaningfully better on semantic queries (manual QA)

## Depends on
Issues: POST /ask endpoint"

echo "✓ Issue 15 created"

# ─────────────────────────────────────────────────────────────────────────────

gh issue create --repo "$REPO" \
  --title "[Phase E] Offline eval golden set for prompt regression testing" \
  --label "phase-e,eval,testing" \
  --body "## Summary
Create a golden dataset of source notes with expected extraction outputs, and a \`npm run eval\` script that measures extraction quality and detects regressions when the indexer prompt changes.

## Structure
\`\`\`
server/tests/fixtures/eval-cases/
  001-attention-mechanism/
    source.md          raw note to compile
    expected.json      expected concepts, proposal items, no-hallucination assertions
    meta.json          { description, topics, difficulty }
  002-gradient-descent/
    ...
  003-conflict-detection/
    source.md          note that contradicts an existing block
    existing-block.md  the block it should conflict with
    expected.json      conflict_detected: true, conflict_summary present
\`\`\`

## expected.json structure
\`\`\`json
{
  \"min_concepts\": 3,
  \"required_concepts\": [\"attention mask\", \"query key value\"],
  \"forbidden_hallucinations\": [\"BERT\", \"GPT-4\"],
  \"should_conflict\": false,
  \"min_coverage_score\": 0.7,
  \"min_grounding_score\": 0.8
}
\`\`\`

## npm run eval script
1. For each eval case: compile the source against expected
2. Run eval judge
3. Compare judge output against expected.json assertions
4. Report: pass/fail per case, coverage scores, regression delta vs previous run
5. Exit non-zero if any case fails (CI-compatible)

## Initial golden set (10 cases minimum)
- 3 learning notes (technical concepts with sub-concepts)
- 2 thinking notes (vague/reflective, tests specificity handling)
- 2 reference notes (paper summaries, tests grounding)
- 2 conflict cases (notes that contradict existing knowledge)
- 1 empty/minimal note (tests graceful handling)

## Acceptance criteria
- [ ] 10+ eval cases in fixtures
- [ ] npm run eval script runs all cases
- [ ] Script exits non-zero on regression
- [ ] Coverage and grounding scores reported per case
- [ ] README section explains how to add new eval cases"

echo "✓ Issue 16 created"

echo ""
echo "✅ All 16 issues created for $REPO"
echo ""
echo "Summary by phase:"
echo "  Phase A (Foundation):       Issues 1–4   (migrations + topics API)"
echo "  Phase B (Agentic compile):  Issues 5–10  (ReAct loop + eval judge)"
echo "  Phase C (RAG):              Issue 11     (/ask endpoint)"
echo "  Phase D (Polish):           Issues 12–14 (conflict UI + eval UI + drop domain)"
echo "  Phase E (Phase 2 search):   Issues 15–16 (pgvector + golden set)"
