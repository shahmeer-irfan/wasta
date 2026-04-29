// ============================================================
// A* Search — generic implementation with full instrumentation.
//
// Algorithm (Hart, Nilsson, Raphael 1968):
//   f(n) = g(n) + h(n)
//     g(n) = cheapest known cost from start → n
//     h(n) = heuristic estimate from n → goal (must be admissible:
//            never overestimates the true remaining cost; otherwise A*
//            is not guaranteed to find the optimal path)
//
//   Maintain an OPEN set (priority queue keyed by f) and a CLOSED set.
//   Each iteration pops the lowest-f node, marks it closed, and relaxes
//   edges to neighbours. Stops when the goal is popped (so we know g
//   is final) or when OPEN drains (no path).
//
// Optimality: with admissible h, the FIRST time the goal is popped,
// g(goal) equals the true shortest-path cost.
//
// We use a "lazy" variant: nodes can be re-pushed with a smaller f.
// On pop we skip already-closed nodes. This avoids decrease-key.
// ============================================================

import { MinHeap } from './min-heap';

export interface AStarGraph<NodeId> {
  /** Returns outgoing edges from `id`. Edge `cost` must be ≥ 0. */
  neighbors(id: NodeId): Array<{ to: NodeId; cost: number }>;
}

export interface AStarOptions<NodeId> {
  start: NodeId;
  isGoal: (id: NodeId) => boolean;
  graph: AStarGraph<NodeId>;
  /** Estimated remaining cost from `id` to the nearest goal. */
  heuristic: (id: NodeId) => number;
  /** Used to key Maps/Sets. Defaults to String(id). */
  keyFn?: (id: NodeId) => string;
  /** Hard cap on expansions for safety. Default 5000 — far above our needs. */
  maxExpansions?: number;
}

export interface AStarResult<NodeId> {
  /** start → goal node sequence (empty if no path was found). */
  path: NodeId[];
  /** Sum of edge costs along the returned path. Infinity if no path. */
  cost: number;
  /** Nodes popped from OPEN, in expansion order — useful for visualisation. */
  expandedNodes: NodeId[];
  /** True iff a goal was reached. */
  found: boolean;
  /** Which goal node was reached, if any. */
  goalReached: NodeId | null;
  /** Per-node g-scores at termination (for analysis / unit tests). */
  gScores: Map<string, number>;
}

export function aStar<NodeId>({
  start,
  isGoal,
  graph,
  heuristic,
  keyFn,
  maxExpansions = 5000,
}: AStarOptions<NodeId>): AStarResult<NodeId> {
  const key = keyFn ?? ((n: NodeId) => String(n));

  const open = new MinHeap<NodeId>();
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, NodeId>();
  const closed = new Set<string>();
  const expandedNodes: NodeId[] = [];

  const startKey = key(start);
  gScore.set(startKey, 0);
  open.push(start, heuristic(start)); // f(start) = 0 + h(start)

  while (!open.isEmpty()) {
    if (expandedNodes.length >= maxExpansions) break;

    const current = open.pop()!;
    const cKey = key(current);

    // Skip stale entries left over from "lazy" decrease-key.
    if (closed.has(cKey)) continue;
    closed.add(cKey);
    expandedNodes.push(current);

    if (isGoal(current)) {
      // Reconstruct the path by walking parent pointers backward.
      const path: NodeId[] = [current];
      let walker: NodeId = current;
      let walkerKey = cKey;
      while (cameFrom.has(walkerKey)) {
        walker = cameFrom.get(walkerKey)!;
        walkerKey = key(walker);
        path.unshift(walker);
      }
      return {
        path,
        cost: gScore.get(cKey) ?? Infinity,
        expandedNodes,
        found: true,
        goalReached: current,
        gScores: gScore,
      };
    }

    const gCurrent = gScore.get(cKey) ?? Infinity;
    for (const { to, cost } of graph.neighbors(current)) {
      if (cost < 0) {
        // A* assumes non-negative edge costs. Bail loudly rather than silently.
        throw new Error(`A*: negative edge cost ${cost} from ${cKey} → ${key(to)}`);
      }
      const tKey = key(to);
      if (closed.has(tKey)) continue;

      const tentativeG = gCurrent + cost;
      const existingG = gScore.get(tKey) ?? Infinity;
      if (tentativeG < existingG) {
        cameFrom.set(tKey, current);
        gScore.set(tKey, tentativeG);
        // Push (possibly duplicate) entry; lazy decrease-key.
        open.push(to, tentativeG + heuristic(to));
      }
    }
  }

  return {
    path: [],
    cost: Infinity,
    expandedNodes,
    found: false,
    goalReached: null,
    gScores: gScore,
  };
}
