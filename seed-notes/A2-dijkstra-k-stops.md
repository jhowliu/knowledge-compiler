# Dijkstra with a K-stop limit

For shortest-path problems with a limit such as "at most k stops" or "at most k+1 edges",
the state is not just the node. The remaining budget is part of the state.

Use a distance table like `dist[node][edges_used]` or `dist[node][remaining_edges]`.
The priority queue stores tuples such as `(cost, node, edges_used)`. When expanding an
edge, only push the next state if the edge budget is still valid and the new cost improves
that exact state.

This prevents a cheaper path with too many edges from incorrectly blocking a more expensive
path that still has budget left.

Sketch:

1. Build the adjacency list.
2. Initialize `dist[src][0] = 0`.
3. Push `(0, src, 0)` into a min-heap.
4. Pop the cheapest state.
5. If `edges_used <= k`, relax neighbors into `edges_used + 1`.
6. The answer is the best distance to `dst` across allowed edge counts.

Common trap: using a one-dimensional `dist[node]` array. That collapses different budgets
into one value and can prune a valid route.

