// ============================================================
// GUARDIAN — LangGraph Emergency Response State Machine
// Nodes: intake → geocoding → broker → pivot (HITL) → patch
// ============================================================

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { KARACHI_LANDMARKS } from '@/lib/constants';
import { createServiceClient } from '@/lib/supabase/client';
import type { IncidentCard, LandmarkData } from '@/types';

// ============================================================
// STATE DEFINITION
// ============================================================
const GuardianState = Annotation.Root({
  // Input
  transcript: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  caller_phone: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  incident_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),

  // Intake output
  incident_card: Annotation<IncidentCard | null>({ reducer: (_, b) => b, default: () => null }),

  // Geocoding output
  landmark_match: Annotation<LandmarkData | null>({ reducer: (_, b) => b, default: () => null }),

  // Broker output
  broadcast_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  target_institute_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  target_institute_phone: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  exclude_list: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),

  // Pivot (HITL) output
  pivot_decision: Annotation<'ACCEPT' | 'REJECT' | ''>({ reducer: (_, b) => b, default: () => '' }),

  // Patch output
  session_id: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),

  // Meta
  status: Annotation<string>({ reducer: (_, b) => b, default: () => 'intake' }),
  error: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type GuardianStateType = typeof GuardianState.State;

// ============================================================
// NODE 1: INTAKE — Parse transcript → IncidentCard
// ============================================================
async function intakeNode(state: GuardianStateType): Promise<Partial<GuardianStateType>> {
  const { transcript, incident_id } = state;

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : ''}${getBaseUrl()}/api/ai/parse-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) throw new Error('Parse API failed');
    const card: IncidentCard = await response.json();

    // Update incident in Supabase
    const supabase = createServiceClient();
    await supabase.from('incidents').update({
      transcript,
      summary: card.summary,
      incident_type: card.incident_type,
      severity: card.severity,
      landmark: card.landmark,
      status: 'intake',
    }).eq('id', incident_id);

    return { incident_card: card, status: 'geocoding' };
  } catch (err) {
    return { error: `Intake failed: ${err}`, status: 'error' };
  }
}

// ============================================================
// NODE 2: GEOCODING — Match landmark → [lat, lng]
// ============================================================
async function geocodingNode(state: GuardianStateType): Promise<Partial<GuardianStateType>> {
  const { incident_card, incident_id } = state;
  if (!incident_card) return { error: 'No incident card', status: 'error' };

  const transcript_lower = (state.transcript + ' ' + (incident_card.landmark || '')).toLowerCase();

  // Fuzzy match against Karachi landmarks
  let bestMatch: LandmarkData | null = null;
  let bestScore = 0;

  for (const lm of KARACHI_LANDMARKS) {
    const nameLower = lm.name.toLowerCase();
    const words = nameLower.split(/\s+/);

    // Check full name or individual words
    let score = 0;
    if (transcript_lower.includes(nameLower)) {
      score = nameLower.length * 2; // Full match bonus
    } else {
      for (const word of words) {
        if (word.length > 2 && transcript_lower.includes(word)) {
          score += word.length;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = lm;
    }
  }

  // Update incident with geocoded data
  const supabase = createServiceClient();
  if (bestMatch) {
    await supabase.from('incidents').update({
      lat: bestMatch.lat,
      lng: bestMatch.lng,
      zone: bestMatch.zone,
      landmark: bestMatch.name,
      status: 'geocoded',
    }).eq('id', incident_id);
  }

  return {
    landmark_match: bestMatch,
    incident_card: {
      ...incident_card,
      lat: bestMatch?.lat ?? null,
      lng: bestMatch?.lng ?? null,
      zone: bestMatch?.zone ?? null,
      landmark: bestMatch?.name ?? incident_card.landmark,
    },
    status: 'broadcasting',
  };
}

// ============================================================
// NODE 3: BROKER — Find nearest institute, create broadcast
// ============================================================
async function brokerNode(state: GuardianStateType): Promise<Partial<GuardianStateType>> {
  const { incident_card, incident_id, exclude_list } = state;
  if (!incident_card?.lat || !incident_card?.lng) {
    return { error: 'No geocoded location', status: 'error' };
  }

  const supabase = createServiceClient();

  // Query available institutes, excluding rejected ones
  let query = supabase
    .from('institutes')
    .select('*')
    .eq('is_available', true);

  if (exclude_list.length > 0) {
    query = query.not('id', 'in', `(${exclude_list.join(',')})`);
  }

  // Match type: accident/medical → ambulance, fire → fire
  const neededType = incident_card.incident_type === 'fire' ? 'fire' : 'ambulance';
  query = query.eq('type', neededType);

  const { data: institutes, error } = await query;
  if (error || !institutes?.length) {
    return { error: 'No available institutes', status: 'error' };
  }

  // Find nearest by haversine distance
  const nearest = institutes.reduce((best, inst) => {
    const d = haversine(incident_card.lat!, incident_card.lng!, inst.lat, inst.lng);
    const dBest = haversine(incident_card.lat!, incident_card.lng!, best.lat, best.lng);
    return d < dBest ? inst : best;
  });

  // Create broadcast record
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

  // Update incident status
  await supabase.from('incidents').update({
    status: 'broadcasting',
  }).eq('id', incident_id);

  return {
    broadcast_id: broadcast?.id ?? '',
    target_institute_id: nearest.id,
    target_institute_phone: nearest.phone,
    status: 'waiting_response',
  };
}

// ============================================================
// NODE 4: PIVOT — HITL Breakpoint (waits for external signal)
// ============================================================
async function pivotNode(state: GuardianStateType): Promise<Partial<GuardianStateType>> {
  // This node is a checkpoint. In production, execution pauses here.
  // The graph resumes when the Institute Dashboard sends ACCEPT/REJECT
  // via the /api/agent/respond endpoint.

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
    }).eq('id', incident_id);

    return { status: 'accepted' };
  }

  if (pivot_decision === 'REJECT') {
    await supabase.from('incident_broadcasts').update({
      status: 'rejected',
      responded_at: new Date().toISOString(),
    }).eq('id', broadcast_id);

    return {
      exclude_list: [...exclude_list, target_institute_id],
      pivot_decision: '',
      status: 'broadcasting',
    };
  }

  // No decision yet — stay in waiting state
  return { status: 'waiting_response' };
}

// ============================================================
// NODE 5: PATCH — Mark dispatched (voice handled via Vapi WebRTC)
// ============================================================
async function patchNode(state: GuardianStateType): Promise<Partial<GuardianStateType>> {
  const { incident_id, target_institute_id } = state;
  const supabase = createServiceClient();

  try {
    // Assign nearest available resource from the accepted institute
    const { data: resource } = await supabase
      .from('resources')
      .select('*')
      .eq('institute_id', target_institute_id)
      .eq('status', 'available')
      .limit(1)
      .single();

    if (resource) {
      await supabase.from('resources').update({ status: 'dispatched' }).eq('id', resource.id);
      await supabase.from('incidents').update({
        status: 'dispatched',
        assigned_resource: resource.id,
      }).eq('id', incident_id);
    } else {
      await supabase.from('incidents').update({
        status: 'dispatched',
      }).eq('id', incident_id);
    }

    // Log the session (voice is handled client-side via Vapi WebRTC)
    await supabase.from('call_logs').insert({
      incident_id,
      status: 'connected',
    });

    return { session_id: `vapi-${incident_id}`, status: 'dispatched' };
  } catch (err) {
    return { error: `Patch failed: ${err}`, status: 'error' };
  }
}

// ============================================================
// ROUTING LOGIC
// ============================================================
function routeAfterPivot(state: GuardianStateType): string {
  if (state.pivot_decision === 'ACCEPT') return 'patch';
  if (state.pivot_decision === 'REJECT') return 'broker'; // Loop back
  return END; // Pause — waiting for HITL input
}

// ============================================================
// BUILD GRAPH
// ============================================================
export function buildGuardianGraph() {
  const graph = new StateGraph(GuardianState)
    .addNode('intake', intakeNode)
    .addNode('geocoding', geocodingNode)
    .addNode('broker', brokerNode)
    .addNode('pivot', pivotNode)
    .addNode('patch', patchNode)
    .addEdge(START, 'intake')
    .addEdge('intake', 'geocoding')
    .addEdge('geocoding', 'broker')
    .addEdge('broker', 'pivot')
    .addConditionalEdges('pivot', routeAfterPivot, ['patch', 'broker', END])
    .addEdge('patch', END);

  return graph.compile();
}

// ============================================================
// HELPERS
// ============================================================
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
