# Dijkstra K-stops, cleaner template

A cleaner template for the "cheapest flight within k stops" family is to treat the stop
count as a dimension of the shortest-path state.

Instead of storing `best[node]`, store `best[node][edges]`. Two paths that reach the same
node with different edge counts are not equivalent, because the remaining budget affects
which future edges may be used.

Implementation notes:

- Put `(cost, node, edges)` in the heap.
- Skip expansion when `edges == k + 1`.
- Relax into `edges + 1` only when the new cost improves `best[next][edges + 1]`.
- Return the minimum cost among allowed states for the destination.

This is the same idea as Dijkstra with state. The important correction is that a cheaper
arrival with no remaining budget should not dominate a slightly more expensive arrival
that still has enough budget to finish.

