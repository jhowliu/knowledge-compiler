# Why retrieval-first eval is wrong

For this project, evaluating retrieval before answer generation is the wrong priority.
The answer generator should be judged first because users only see the final answer.

The system should retrieve raw source chunks directly and ignore approved knowledge blocks.
Raw chunks are closer to the original text, so they should be treated as the primary answer
corpus. Approved knowledge blocks add an unnecessary review layer and can hide details from
the original source.

Suggested loop:

1. Generate the answer from raw chunks.
2. Score whether the final answer sounds helpful.
3. Only inspect retrieval if the answer sounds bad.
4. Do not spend time evaluating approved knowledge blocks separately.

This contradicts the retrieval-first RAG evaluation loop. If the system already has a note
that says approved knowledge blocks are the answer corpus, this source should trigger a
conflict instead of silently replacing the older note.

