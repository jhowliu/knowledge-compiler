# Psych verification set — create / update / eval

Plain-language social-psychology notes for testing the compile agent's
**create_knowledge** vs **update_existing_knowledge** decision and the grounding
**eval verdict**. No technical jargon, so the judgment is easy to eyeball.

## Compile in this order

| Step | File | Expected outcome | What it verifies |
|---|---|---|---|
| 1 | `P1-bystander-effect.md` | **create_knowledge** | Clean create; concepts extracted; eval `pass` (claims grounded in verbatim spans). **Approve it before step 2.** |
| 2 | `P2-bystander-effect-update.md` | **update_existing_knowledge** → targets P1's block | Same concept, **heavily reworded** ("crowds freeze", "pluralistic ignorance") → should update P1, not create a duplicate. |
| 3 | `P3-confirmation-bias.md` | **create_knowledge** | A *different* concept → clean create; must NOT merge into the bystander block. |

## What to check

**Routing**
- P1 → new knowledge block.
- P2 → updates P1's block (a 2nd version of the same source), **not** a new block.
  If it creates a new block, recall/concept-matching missed the link.
- P3 → its own new block, unrelated to P1/P2.

**Eval verdict (Review Queue)**
- P1: `pass` — straightforward note, claims have verbatim source spans.
- P2: this is the interesting one. It says the *same thing* as P1 but with almost
  different words ("onlookers", "freeze", "pluralistic ignorance" vs P1's
  "bystanders", "diffusion of responsibility"). Grounding is judged against **P2's
  own source text**, so it should still be `pass` — but watch the warnings:
  - Old lexical heuristic could spuriously flag a paraphrased claim as "weak lexical
    support".
  - After the LLM semantic judge (#129), a faithful paraphrase should be `pass`.
- P3: `pass`.

**Concepts**
- P1 and P2 should share concepts (e.g. "bystander effect", "diffusion of
  responsibility") so P2 recalls P1. P3's concepts ("confirmation bias") stay
  separate.

## Notes

- Throwaway test inputs, like the rest of `seed-notes/`.
- For a conflict / `conflict_detected` case, see the existing `seed-notes/D1-*`.
