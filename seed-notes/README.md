# Seed notes — agent loop verification set

A small corpus to verify the compile agent's **judgment quality**, not just that it runs.
Each note is crafted to exercise one decision path. The note files contain **only the
content** (no hints); this README is the answer key.

> These are throwaway test inputs — not part of the app. Delete or keep as you like.

## How to use

Create each note as a Source (editor or import), then **Compile**, and check the result
against the "Expected" column. Compile in the order below — the update/conflict cases
depend on the base notes existing first.

### Phase 1 — base knowledge + keep-searchable (compile in any order)

| File | Title | Role | Expected outcome | What it verifies |
|---|---|---|---|---|
| `A1-binary-search-on-answer.md` | Binary Search on Answer | reference | **create_knowledge** | clean create; concepts extracted; grounded |
| `A2-dijkstra-k-stops.md` | Dijkstra with a K-stop limit | reference | **create_knowledge** | create; structured facets (method/steps) |
| `A3-rag-evaluation-loop.md` | RAG Evaluation Loop | reference | **create_knowledge** | create; base for update/conflict below |
| `B1-tell-me-about-yourself.md` | Tell me about yourself | personal_note | **keep_searchable** | interview draft is NOT promoted to knowledge |
| `B2-self-intro-zh.md` | 自我介紹草稿 | personal_note | **keep_searchable** | #105: non-English keep works (no regex) |
| `B3-meeting-notes.md` | Sync notes 2026-06-02 | personal_note | **keep_searchable** | meeting/TODO stays a source |

After Phase 1 also check: B1/B2/B3 created **no** Knowledge Block and **no** graph node,
but are still searchable (concepts indexed).

### Phase 2 — iteration + conflict + links (compile AFTER Phase 1)

| File | Title | Role | Expected | What it verifies |
|---|---|---|---|---|
| `C1-dijkstra-k-stops-cleaner.md` | Dijkstra K-stops, cleaner template | reference | **update_existing_knowledge** → targets A2's block | #104: same concept, different wording → updates, not a duplicate |
| `C2-rag-eval-supplement-zh.md` | RAG 評估流程補充 | reference | **update_existing_knowledge** → targets A3's block | #104 cross-language recall (advanced; see note below) |
| `D1-rag-eval-contradiction.md` | Why retrieval-first eval is wrong | reference | **update** with **conflict_detected: true** vs A3 | conflict is LLM-judged, `needs_user_decision`, summary present |
| `E1-monotonic-predicate.md` | Monotonic feasibility predicate | reference | **create_knowledge** + **suggested link → A1** | link discovery (related but distinct concept) |

## What to check per compile (quality rubric)

- **Outcome** matches Expected (keep / create / update).
- **Update target**: for C1/C2/D1 the proposal updates the *right existing block*, not a new one.
- **Conflict**: D1 has `conflict_detected: true`, a real `conflict_summary`, resolution `needs_user_decision`; the others have no false conflict.
- **Grounding**: every knowledge item's `source_spans` are verbatim from the note; no invented claims (check the eval grounding lint shows no `ungrounded`).
- **Concepts**: sensible concept names extracted; reused across related notes (A1↔E1, A2↔C1, A3↔C2/D1).
- **Links**: E1 proposes a link to A1; weak/unrelated notes do not spew links.
- **keep_searchable**: B1/B2/B3 produce a keep proposal only — no block, no graph node.
- **Trace**: open the Agent Run drawer — tool order should make sense and vary by note (search before the keep/create/update decision).

## Notes / known limits

- **C2 (cross-language update)** is the hardest case. Recall relies on the concept index;
  if A3's concepts are English and C2's are Chinese, they may not overlap and C2 could
  create a new block instead of updating A3. C2 deliberately mixes in the English term
  "RAG evaluation" to give recall a fair chance. If it still creates new, that's a real
  signal that cross-language concept normalization is a gap (candidate follow-up).
- Update/conflict require A2/A3 to be **approved** first if your update-target lookup reads
  approved blocks only. Approve A2 and A3 in the Review Inbox before compiling C1/C2/D1.
