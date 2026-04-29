// ============================================================
// WAASTA v2 — LangGraph Emergency Response Pipeline
// Nodes: intake → geocode → broker → pivot (HITL) → patch
// REWRITTEN: fixes all 16 bugs from v1
// ============================================================

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { KARACHI_LANDMARKS } from '@/lib/constants';
import { createServiceClient } from '@/lib/supabase/client';
import { reverseGeocode } from '@/lib/geocoding';
import { aStar } from '@/lib/ai/a-star';
import {
  buildKarachiGraph,
  multiGoalHaversineHeuristic,
  instituteIdFromNodeId,
  INCIDENT_NODE_ID,
  haversineKm as graphHaversine,
} from '@/lib/ai/karachi-graph';
import type { IncidentCard, LandmarkData } from '@/types';

// ── State ────────────────────────────────────────────────────
const WaastaState = Annotation.Root({
  transcript: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  incident_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),

  incident_card: Annotation<IncidentCard | null>({ reducer: (_, b) => b, default: () => null }),
  landmark_match: Annotation<LandmarkData | null>({ reducer: (_, b) => b, default: () => null }),

  broadcast_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  target_institute_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  exclude_list: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),

  pivot_decision: Annotation<'ACCEPT' | 'REJECT' | ''>({ reducer: (_, b) => b, default: () => '' }),

  status: Annotation<string>({ reducer: (_, b) => b, default: () => 'intake' }),
  error: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type WaastaStateType = typeof WaastaState.State;

// ── NODE 1: INTAKE — Parse transcript via Groq ──────────────
async function intakeNode(state: WaastaStateType): Promise<Partial<WaastaStateType>> {
  const { transcript, incident_id } = state;

  console.log('[GRAPH:INTAKE] Parsing transcript for incident', incident_id);
  console.log('[GRAPH:INTAKE] Transcript:', transcript.substring(0, 100));

  const supabase = createServiceClient();

  // Fetch existing incident to get GPS coords stored by trigger
  const { data: existingIncident } = await supabase
    .from('incidents')
    .select('lat, lng')
    .eq('id', incident_id)
    .single();

  let card: IncidentCard;

  try {
    const response = await fetch(`${getBaseUrl()}/api/ai/parse-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) throw new Error(`Parse API ${response.status}`);
    card = await response.json();
    console.log('[GRAPH:INTAKE] Parsed →', JSON.stringify(card));
  } catch (err) {
    console.error('[GRAPH:INTAKE] Groq failed, using fallback:', err);
    // Fallback: basic card from transcript keywords
    card = {
      incident_type: transcript.toLowerCase().includes('fire') ? 'fire'
        : transcript.toLowerCase().includes('accident') ? 'accident'
        : 'medical',
      summary: transcript.substring(0, 150),
      severity: 3,
      landmark: null,
      zone: null,
      lat: existingIncident?.lat || null,
      lng: existingIncident?.lng || null,
    };
  }

  // Inherit GPS coords from trigger if card doesn't have them
  if (!card.lat && existingIncident?.lat) {
    card.lat = existingIncident.lat;
    card.lng = existingIncident.lng;
  }

  await supabase.from('incidents').update({
    transcript,
    summary: card.summary,
    incident_type: card.incident_type,
    severity: card.severity,
    landmark: card.landmark,
    status: 'intake',
    updated_at: new Date().toISOString(),
  }).eq('id', incident_id);

  return { incident_card: card, status: 'geocoding' };
}

// ── NODE 2: GEOCODE — Match landmark to coordinates ─────────
async function geocodeNode(state: WaastaStateType): Promise<Partial<WaastaStateType>> {
  const { incident_card, incident_id } = state;
  console.log('[GRAPH:GEOCODE] Starting for incident', incident_id);
  console.log('[GRAPH:GEOCODE] Landmark from card:', incident_card?.landmark);
  if (!incident_card) return { error: 'No incident card', status: 'error' };

  // Build search text from transcript + extracted landmark
  const searchText = `${state.transcript} ${incident_card.landmark || ''}`.toLowerCase();

  // Score each landmark
  let bestMatch: LandmarkData | null = null;
  let bestScore = 0;

  for (const lm of KARACHI_LANDMARKS) {
    const nameLower = lm.name.toLowerCase();
    let score = 0;

    // Exact full name match (highest priority)
    if (searchText.includes(nameLower)) {
      score = 100 + nameLower.length;
    } else {
      // Word-level matching
      const words = nameLower.split(/\s+/);
      for (const word of words) {
        if (word.length >= 3 && searchText.includes(word)) {
          score += word.length * 2;
        }
      }
      // Also check zone name
      if (searchText.includes(lm.zone.toLowerCase())) {
        score += 5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = lm;
    }
  }

  // Require meaningful match
  if (bestScore < 6) {
    console.log('[GRAPH:GEOCODE] Score too low:', bestScore, '→ no match');
    bestMatch = null;
  } else {
    console.log('[GRAPH:GEOCODE] Matched:', bestMatch?.name, 'score:', bestScore);
  }

  const supabase = createServiceClient();

  if (bestMatch) {
    await supabase.from('incidents').update({
      lat: bestMatch.lat,
      lng: bestMatch.lng,
      zone: bestMatch.zone,
      landmark: bestMatch.name,
      status: 'geocoded',
      updated_at: new Date().toISOString(),
    }).eq('id', incident_id);
  } else {
    // No landmark match — use incident's GPS coords (from trigger) or Karachi center
    const fallbackLat = incident_card.lat ?? 24.8607;
    const fallbackLng = incident_card.lng ?? 67.0011;
    const resolvedLandmark = incident_card.landmark || await reverseGeocode(fallbackLat, fallbackLng);
    
    console.log('[GRAPH:GEOCODE] No landmark match, using fallback coords:', fallbackLat, fallbackLng, 'Resolved name:', resolvedLandmark);

    await supabase.from('incidents').update({
      lat: fallbackLat,
      lng: fallbackLng,
      landmark: resolvedLandmark,
      status: 'geocoded',
      updated_at: new Date().toISOString(),
    }).eq('id', incident_id);
  }

  // Use matched coords, or existing GPS, or Karachi center
  const finalLat = bestMatch?.lat ?? incident_card.lat ?? 24.8607;
  const finalLng = bestMatch?.lng ?? incident_card.lng ?? 67.0011;
  const finalLandmark = bestMatch?.name ?? incident_card.landmark ?? await reverseGeocode(finalLat, finalLng);

  console.log('[GRAPH:GEOCODE] Final coords:', finalLat, finalLng, finalLandmark);

  return {
    landmark_match: bestMatch,
    incident_card: {
      ...incident_card,
      lat: finalLat,
      lng: finalLng,
      zone: bestMatch?.zone ?? null,
      landmark: finalLandmark,
    },
    status: 'broadcasting',
  };
}

// ── NODE 3: BROKER — A* search picks the optimal institute ──────
//
// Replaces the previous straight-line haversine reduce with a real
// informed-search algorithm. We build a small graph of Karachi
// landmarks + the available institutes + the incident, then run
// A* from the incident toward the nearest goal-set institute.
//
// Why A* and not haversine: haversine underestimates true road cost
// because it ignores the road network's actual topology. Two
// institutes can be close as the crow flies yet far apart by road
// (e.g. across the harbour). A* with traffic-weighted edges gives
// the realistic answer; haversine stays as a (provably admissible)
// heuristic — it can never overestimate the true road cost.
async function brokerNode(state: WaastaStateType): Promise<Partial<WaastaStateType>> {
  const { incident_card, incident_id, exclude_list } = state;
  console.log('[GRAPH:BROKER] Starting for incident', incident_id);
  console.log('[GRAPH:BROKER] Exclude list:', exclude_list);
  if (!incident_card) return { error: 'No incident card', status: 'error' };

  const incLat = incident_card.lat ?? 24.8607;
  const incLng = incident_card.lng ?? 67.0011;
  console.log('[GRAPH:BROKER] Incident coords:', incLat, incLng);

  const supabase = createServiceClient();

  const { data: allInstitutes, error } = await supabase
    .from('institutes').select('*').eq('is_available', true);
  if (error || !allInstitutes?.length) {
    return { error: 'No available institutes', status: 'error' };
  }

  const institutes = allInstitutes.filter((i) => !exclude_list.includes(i.id));
  console.log('[GRAPH:BROKER] All institutes:', allInstitutes.length,
    'After exclude:', institutes.length);
  if (institutes.length === 0) {
    console.error('[GRAPH:BROKER] No institutes available after filtering');
    return { error: 'All institutes rejected or unavailable', status: 'error' };
  }

  // ── Build the graph & run A* ───────────────────────────────
  const t0 = Date.now();
  const { graph: graphData, impl } = buildKarachiGraph(
    institutes.map((i) => ({ id: i.id, name: i.name, lat: i.lat, lng: i.lng })),
    { lat: incLat, lng: incLng },
  );

  const goalSet = new Set(graphData.instituteNodeIds);
  const result = aStar({
    start: INCIDENT_NODE_ID,
    isGoal: (id) => goalSet.has(id),
    graph: impl,
    heuristic: multiGoalHaversineHeuristic(graphData, graphData.instituteNodeIds),
  });
  const ms = Date.now() - t0;

  let chosen: typeof institutes[number] | null = null;
  let searchTrace: Record<string, unknown> | null = null;

  if (result.found && result.goalReached) {
    const chosenId = instituteIdFromNodeId(result.goalReached);
    chosen = institutes.find((i) => i.id === chosenId) ?? null;

    const pathLabels = result.path
      .map((id) => graphData.nodes.get(id)?.label ?? id)
      .join(' → ');
    console.log(
      `[GRAPH:BROKER] A* found ${chosen?.name} ` +
      `via ${result.path.length - 1} hops, ` +
      `cost ${result.cost.toFixed(2)} km, ` +
      `expanded ${result.expandedNodes.length}/${graphData.nodes.size} nodes ` +
      `in ${ms}ms`,
    );
    console.log(`[GRAPH:BROKER] A* path: ${pathLabels}`);

    searchTrace = {
      algorithm: 'A*',
      path: result.path.map((id) => {
        const n = graphData.nodes.get(id);
        return n
          ? { id, label: n.label, lat: n.lat, lng: n.lng, kind: n.kind }
          : null;
      }).filter(Boolean),
      cost_km: Math.round(result.cost * 100) / 100,
      hops: Math.max(0, result.path.length - 1),
      expanded_nodes: result.expandedNodes
        .map((id) => {
          const n = graphData.nodes.get(id);
          return n ? { id, label: n.label, lat: n.lat, lng: n.lng, kind: n.kind } : null;
        })
        .filter(Boolean),
      total_nodes: graphData.nodes.size,
      took_ms: ms,
      heuristic: 'haversine_to_nearest_goal',
      chosen_institute: chosen ? { id: chosen.id, name: chosen.name } : null,
    };
  } else {
    // A* failed — graph might be disconnected or all institutes filtered out.
    // Fall back to plain haversine reduce so dispatch still works.
    console.warn('[GRAPH:BROKER] A* found no path — falling back to haversine');
    chosen = institutes.reduce((best, inst) => {
      const d = graphHaversine({ lat: incLat, lng: incLng }, inst);
      const dBest = graphHaversine({ lat: incLat, lng: incLng }, best);
      return d < dBest ? inst : best;
    });
    searchTrace = {
      algorithm: 'haversine_fallback',
      reason: 'A* found no path through landmark graph',
      chosen_institute: { id: chosen.id, name: chosen.name },
      cost_km: Math.round(graphHaversine({ lat: incLat, lng: incLng }, chosen) * 100) / 100,
    };
  }

  if (!chosen) {
    return { error: 'Broker could not select institute', status: 'error' };
  }

  // ── Create broadcast ─────────────────────────────────────────
  const { data: broadcast } = await supabase
    .from('incident_broadcasts')
    .insert({
      incident_id,
      institute_id: chosen.id,
      status: 'pending',
      confidence: 0.92,
    })
    .select()
    .single();

  // ── Persist trace + status. search_trace is optional: if the column
  // doesn't exist yet (migration not run) the update silently drops it
  // server-side — the rest of the row still updates fine. ───
  const updatePayload: Record<string, unknown> = {
    status: 'broadcasting',
    updated_at: new Date().toISOString(),
  };
  if (searchTrace) updatePayload.search_trace = searchTrace;

  const { error: updErr } = await supabase
    .from('incidents').update(updatePayload).eq('id', incident_id);
  if (updErr && /search_trace/.test(updErr.message)) {
    console.warn('[GRAPH:BROKER] search_trace column missing — run supabase/add_search_trace.sql');
    await supabase.from('incidents').update({
      status: 'broadcasting',
      updated_at: new Date().toISOString(),
    }).eq('id', incident_id);
  }

  return {
    broadcast_id: broadcast?.id ?? '',
    target_institute_id: chosen.id,
    status: 'waiting_response',
  };
}

// ── NODE 4: PIVOT — HITL breakpoint ─────────────────────────
async function pivotNode(state: WaastaStateType): Promise<Partial<WaastaStateType>> {
  const { pivot_decision, broadcast_id, target_institute_id, exclude_list, incident_id } = state;
  const supabase = createServiceClient();

  if (pivot_decision === 'ACCEPT') {
    await supabase.from('incident_broadcasts').update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    }).eq('id', broadcast_id);

    await supabase.from('incidents').update({
      status: 'accepted',
      accepted_by: target_institute_id,
      updated_at: new Date().toISOString(),
    }).eq('id', incident_id);

    return { status: 'accepted' };
  }

  if (pivot_decision === 'REJECT') {
    await supabase.from('incident_broadcasts').update({
      status: 'rejected',
      responded_at: new Date().toISOString(),
    }).eq('id', broadcast_id);

    // Persist exclude list to DB so it survives graph re-invocation
    const newExcludeList = [...exclude_list, target_institute_id];
    await supabase.from('incidents').update({
      exclude_list: newExcludeList,
      updated_at: new Date().toISOString(),
    }).eq('id', incident_id);

    return {
      exclude_list: newExcludeList,
      pivot_decision: '',
      status: 'broadcasting',
    };
  }

  // No decision — graph pauses here (END)
  return { status: 'waiting_response' };
}

// ── NODE 5: PATCH — Mark dispatched (dispatch is separate API) ─
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function patchNode(_state: WaastaStateType): Promise<Partial<WaastaStateType>> {
  // Dispatch is handled by /api/dispatch (human clicks button)
  // This node just confirms the accept state is clean
  return { status: 'accepted' };
}

// ── ROUTING ──────────────────────────────────────────────────
function routeAfterPivot(state: WaastaStateType): string {
  if (state.pivot_decision === 'ACCEPT') return 'patch';
  if (state.pivot_decision === 'REJECT') return 'broker';
  return END; // Pause for HITL
}

// ── BUILD ────────────────────────────────────────────────────
export function buildWaastaGraph() {
  const graph = new StateGraph(WaastaState)
    .addNode('intake', intakeNode)
    .addNode('geocode', geocodeNode)
    .addNode('broker', brokerNode)
    .addNode('pivot', pivotNode)
    .addNode('patch', patchNode)
    .addEdge(START, 'intake')
    .addEdge('intake', 'geocode')
    .addEdge('geocode', 'broker')
    .addEdge('broker', 'pivot')
    .addConditionalEdges('pivot', routeAfterPivot, ['patch', 'broker', END])
    .addEdge('patch', END);

  return graph.compile();
}

// ── HELPERS ──────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
