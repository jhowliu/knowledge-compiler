# Monotonic feasibility predicate

A monotonic feasibility predicate is a boolean function used to test whether a proposed
answer value is possible.

For binary search on answer, the predicate must split the search space into two contiguous
regions:

- values that are impossible
- values that are possible

Example: in "minimum capacity to ship packages within D days", `feasible(capacity)` returns
true when that capacity can ship all packages within D days. If a capacity works, any larger
capacity also works, so the predicate is monotonic.

Design checklist:

1. Define exactly what `x` means.
2. Prove that if `feasible(x)` is true, then larger or smaller values stay true depending on
   the direction of the problem.
3. Make the predicate deterministic and cheap enough to call O(log range) times.

This should link naturally to a Binary Search on Answer note, but it is a separate concept:
the predicate is the reusable condition that makes the search valid.

