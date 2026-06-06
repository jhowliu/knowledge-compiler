# RAG Evaluation Loop

A useful RAG evaluation loop checks retrieval before judging the final answer.
If retrieval fails to surface the right approved knowledge blocks, answer quality will look
bad even when generation is behaving correctly.

The loop:

1. Write a small set of representative questions.
2. For each question, inspect the retrieved approved knowledge blocks.
3. Mark whether the retrieved blocks contain enough grounded evidence to answer.
4. Only then evaluate the generated answer for citation quality, coverage, and refusal behavior.
5. When retrieval misses, improve chunking, concepts, or links before changing the answer prompt.

Raw source chunks should be used as citation evidence and audit trail. They should not be
the primary answer corpus. The approved knowledge blocks are the answerable corpus because
they have passed review and are shaped for reuse.

This separation makes failures easier to diagnose: retrieval miss, weak knowledge block,
or answer synthesis problem.

