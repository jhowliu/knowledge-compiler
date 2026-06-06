# Binary Search on Answer

When a problem asks for the minimum or maximum value that satisfies some condition,
and the condition is **monotonic** in that value, you can binary search over the answer
space instead of searching the input.

The key requirement: there is a predicate `feasible(x)` that is false for all x below
some threshold and true for all x at or above it (or vice versa). Because feasibility
flips exactly once, binary search finds the boundary in O(log range) checks.

Steps:
1. Identify the answer range `[lo, hi]`.
2. Write a `feasible(x)` predicate that returns a boolean.
3. Binary search for the smallest x where `feasible(x)` is true.

Typical uses: "minimum capacity to ship packages in D days", "smallest largest-subarray-sum
after k splits", "minimum eating speed". The cost of each feasibility check times log(range)
must be acceptable.

A common mistake is binary searching the answer when feasibility is **not** monotonic — then
the boundary is not well defined and the search returns a wrong value.
