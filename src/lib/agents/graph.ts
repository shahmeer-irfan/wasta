// ============================================================
// WAASTA v2 — LangGraph Emergency Response Pipeline
// Nodes: intake → geocode → broker → pivot (HITL) → patch
// REWRITTEN: fixes all 16 bugs from v1
// ============================================================

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { KARACHI_LANDMARKS } from '@/lib/constants';
import { createServiceClient } from '@/lib/supabase/client';
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

  try {
    console.log('[GRAPH:INTAKE] Parsing transcript for incident', incident_id);
    console.log('[GRAPH:INTAKE] Transcript:', transcript.substring(0, 100));

    const response = await fetch(`${getBaseUrl()}/api/ai/parse-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) throw new Error(`Parse API ${response.status}`);
    const card: IncidentCard = await response.json();

    console.log('[GRAPH:INTAKE] Parsed →', JSON.stringify(card));

    const supabase = createServiceClient();
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
  } catch (err) {
    console.error('[GRAPH:INTAKE] FAILED:', err);
    return { error: `Intake failed: ${err}`, status: 'error' };
  }
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
    // No match — use Karachi center, still mark geocoded
    await supabase.from('incidents').update({
      lat: 24.8607,
      lng: 67.0011,
      landmark: incident_card.landmark || 'Unknown',
      status: 'geocoded',
      updated_at: new Date().toISOString(),
    }).eq('id', incident_id);
  }

  return {
    landmark_match: bestMatch,
    incident_card: {
      ...incident_card,
      lat: bestMatch?.lat ?? 24.8607,
      lng: bestMatch?.lng ?? 67.0011,
      zone: bestMatch?.zone ?? null,
      landmark: bestMatch?.name ?? incident_card.landmark,
    },
    status: 'broadcasting',
  };
}

// ── NODE 3: BROKER — Find nearest institute, create broadcast ─
async function brokerNode(state: WaastaStateType): Promise<Partial<WaastaStateType>> {
  const { incident_card, incident_id, exclude_list } = state;
  console.log('[GRAPH:BROKER] Starting for incident', incident_id);
  console.log('[GRAPH:BROKER] Exclude list:', exclude_list);
  if (!incident_card) return { error: 'No incident card', status: 'error' };

  const incLat = incident_card.lat ?? 24.8607;
  const incLng = incident_card.lng ?? 67.0011;
  console.log('[GRAPH:BROKER] Incident coords:', incLat, incLng);

  const supabase = createServiceClient();

  // Query available institutes
  const { data: allInstitutes, error } = await supabase
    .from('institutes')
    .select('*')
    .eq('is_available', true);

  if (error || !allInstitutes?.length) {
    return { error: 'No available institutes', status: 'error' };
  }

  // Filter out excluded institutes
  const institutes = allInstitutes.filter(
    (inst) => !exclude_list.includes(inst.id)
  );

  console.log('[GRAPH:BROKER] All institutes:', allInstitutes.length, 'After exclude:', institutes.length);
  console.log('[GRAPH:BROKER] Available:', institutes.map(i => `${i.name} (${i.id.substring(0,8)})`));

  if (institutes.length === 0) {
    console.error('[GRAPH:BROKER] No institutes available after filtering');
    return { error: 'All institutes rejected or unavailable', status: 'error' };
  }

  // Find nearest by haversine
  const nearest = institutes.reduce((best, inst) => {
    const d = haversine(incLat, incLng, inst.lat, inst.lng);
    const dBest = haversine(incLat, incLng, best.lat, best.lng);
    return d < dBest ? inst : best;
  });

  console.log('[GRAPH:BROKER] Selected:', nearest.name, 'ID:', nearest.id.substring(0,8), 'dist:', haversine(incLat, incLng, nearest.lat, nearest.lng).toFixed(2), 'km');

  // Create broadcast
  const { data: broadcast } = await supabase
    .from('incident_broadcasts')
    .insert({
      incident_id,
      institute_id: nearest.id,
      status: 'pending',
      confidence: 0.92,
    })
    .select()
    .single();

  // Update incident
  await supabase.from('incidents').update({
    status: 'broadcasting',
    updated_at: new Date().toISOString(),
  }).eq('id', incident_id);

  return {
    broadcast_id: broadcast?.id ?? '',
    target_institute_id: nearest.id,
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
