// ============================================================
// Karachi Road Graph — for A* dispatcher routing.
//
// Nodes  (3 kinds):
//   landmark — one of the 10 hand-coded points in lib/constants.ts
//   institute — pulled from the `institutes` Supabase table
//   incident — the caller's location, added dynamically per query
//
// Edges  (undirected, hand-curated):
//   Static landmark↔landmark adjacencies based on real Karachi geography.
//   Each institute is auto-linked to its 2 nearest landmarks.
//   The incident is auto-linked to its 2 nearest landmarks/institutes.
//
// Edge cost: haversine_km × trafficFactor.
//   trafficFactor ≥ 1.0 — congested arterials (Saddar, Clifton Bridge)
//   are penalised. Plain haversine without the factor is the heuristic.
//   This guarantees the heuristic is admissible: it can never overestimate
//   the true road cost, so A* returns the optimal institute.
// ============================================================

import { KARACHI_LANDMARKS } from '@/lib/constants';
import type { AStarGraph } from './a-star';

export const INCIDENT_NODE_ID = '__incident__';

export type NodeKind = 'landmark' | 'institute' | 'incident';

export interface GraphNode {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: NodeKind;
}

export interface InstituteForGraph {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface KarachiGraphData {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, Array<{ to: string; cost: number }>>;
  /** Convenience: list of institute node IDs (the goal set). */
  instituteNodeIds: string[];
}

// ============================================================
// Static landmark adjacency — hand-curated from Karachi geography.
// Each entry: [landmark A name, landmark B name, traffic factor].
// ============================================================
const STATIC_LANDMARK_EDGES: Array<readonly [string, string, number]> = [
  // Gulshan / FB Area cluster (close-knit, light traffic)
  ['Moti Mahal',      'Nipa Chowrangi',   1.00],
  ['Nipa Chowrangi',  'Lucky One Mall',   1.00],
  ['Moti Mahal',      'Lucky One Mall',   1.10],

  // North spine
  ['Lucky One Mall',  'North Nazimabad',  1.10],
  ['North Nazimabad', 'Saddar',           1.30],

  // Saddar hub — dense + congested
  ['Saddar',          'Nursery',          1.30],
  ['Saddar',          'Clifton Bridge',   1.40],

  // PECHS belt
  ['Nursery',         'Tariq Road',       1.00],
  ['Tariq Road',      'Korangi Crossing', 1.20],
  ['Nursery',         'Clifton Bridge',   1.20],

  // South / coast
  ['Clifton Bridge',  'Do Darya',         1.10],
  ['Do Darya',        'Korangi Crossing', 1.00],

  // Ring-back to Gulshan (long but real)
  ['Korangi Crossing','Moti Mahal',       1.10],
];

// ============================================================
// Geo helpers
// ============================================================
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function landmarkNodeId(name: string): string {
  return 'lm:' + name.toLowerCase().replace(/\s+/g, '-');
}

function instituteNodeId(uuid: string): string {
  return 'inst:' + uuid;
}

// ============================================================
// Graph builder
// ============================================================
export function buildKarachiGraph(
  institutes: InstituteForGraph[],
  incident: { lat: number; lng: number },
  options: { institutesPerLandmark?: number; incidentLinks?: number } = {}
): { graph: KarachiGraphData; impl: AStarGraph<string> } {
  const { institutesPerLandmark = 2, incidentLinks = 2 } = options;

  const nodes = new Map<string, GraphNode>();
  const adjacency = new Map<string, Array<{ to: string; cost: number }>>();

  // ── 1. Add landmark nodes ────────────────────────────────────
  for (const lm of KARACHI_LANDMARKS) {
    const id = landmarkNodeId(lm.name);
    nodes.set(id, { id, label: lm.name, lat: lm.lat, lng: lm.lng, kind: 'landmark' });
    adjacency.set(id, []);
  }

  // ── 2. Add static landmark↔landmark edges ────────────────────
  for (const [aName, bName, traffic] of STATIC_LANDMARK_EDGES) {
    const aId = landmarkNodeId(aName);
    const bId = landmarkNodeId(bName);
    const a = nodes.get(aId);
    const b = nodes.get(bId);
    if (!a || !b) {
      console.warn(`[GRAPH] Edge skipped — missing landmark: ${aName} or ${bName}`);
      continue;
    }
    const cost = haversineKm(a, b) * traffic;
    adjacency.get(aId)!.push({ to: bId, cost });
    adjacency.get(bId)!.push({ to: aId, cost });
  }

  // ── 3. Add institute nodes + connect each to nearest landmarks ─
  const instituteNodeIds: string[] = [];
  for (const inst of institutes) {
    const id = instituteNodeId(inst.id);
    instituteNodeIds.push(id);
    nodes.set(id, { id, label: inst.name, lat: inst.lat, lng: inst.lng, kind: 'institute' });
    adjacency.set(id, []);

    const ranked = KARACHI_LANDMARKS
      .map((lm) => ({ id: landmarkNodeId(lm.name), dist: haversineKm(inst, lm) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, institutesPerLandmark);

    for (const { id: lmId, dist } of ranked) {
      adjacency.get(id)!.push({ to: lmId, cost: dist });
      adjacency.get(lmId)!.push({ to: id, cost: dist });
    }
  }

  // ── 4. Add incident node + connect to nearest landmarks/institutes ─
  nodes.set(INCIDENT_NODE_ID, {
    id: INCIDENT_NODE_ID,
    label: 'Incident',
    lat: incident.lat,
    lng: incident.lng,
    kind: 'incident',
  });
  adjacency.set(INCIDENT_NODE_ID, []);

  // Rank ALL non-incident nodes (landmarks + institutes) by distance,
  // pick the K nearest. Including institutes here lets a very-near
  // institute be one hop away from the incident.
  const candidates: Array<{ id: string; dist: number }> = Array.from(nodes.values())
    .filter((node) => node.id !== INCIDENT_NODE_ID)
    .map((node) => ({ id: node.id, dist: haversineKm(incident, node) }));
  candidates.sort((a, b) => a.dist - b.dist);
  for (const { id, dist } of candidates.slice(0, incidentLinks)) {
    adjacency.get(INCIDENT_NODE_ID)!.push({ to: id, cost: dist });
    adjacency.get(id)!.push({ to: INCIDENT_NODE_ID, cost: dist });
  }

  const graph: KarachiGraphData = { nodes, adjacency, instituteNodeIds };

  const impl: AStarGraph<string> = {
    neighbors: (id) => adjacency.get(id) ?? [],
  };

  return { graph, impl };
}

// ============================================================
// Multi-goal admissible heuristic.
// h(n) = min over goals g of haversine(n, g).
//
// Admissibility check: every edge in the graph has cost = haversine × ≥1.0,
// so the true cheapest path from n to ANY goal is ≥ haversine(n, nearest goal).
// Therefore h never overestimates — A* is guaranteed optimal.
// ============================================================
export function multiGoalHaversineHeuristic(
  graph: KarachiGraphData,
  goalIds: string[]
): (id: string) => number {
  const goalNodes = goalIds
    .map((id) => graph.nodes.get(id))
    .filter((n): n is GraphNode => Boolean(n));

  return (id: string) => {
    const node = graph.nodes.get(id);
    if (!node) return Infinity;
    let min = Infinity;
    for (const goal of goalNodes) {
      const d = haversineKm(node, goal);
      if (d < min) min = d;
    }
    return min;
  };
}

// ============================================================
// Helpers — strip prefix from a node ID
// ============================================================
export function instituteIdFromNodeId(nodeId: string): string | null {
  return nodeId.startsWith('inst:') ? nodeId.slice('inst:'.length) : null;
}
