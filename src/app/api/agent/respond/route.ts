import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// Institution accepts or rejects a broadcast
// NO re-running the graph. Direct Supabase updates.
export async function POST(req: NextRequest) {
  const { broadcast_id, decision } = await req.json();

  console.log('[RESPOND] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[RESPOND] broadcast_id:', broadcast_id, 'decision:', decision);

  if (!broadcast_id || !['ACCEPT', 'REJECT'].includes(decision)) {
    console.error('[RESPOND] Invalid request');
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch broadcast with related incident
  const { data: broadcast } = await supabase
    .from('incident_broadcasts')
    .select('*, incidents(*)')
    .eq('id', broadcast_id)
    .single();

  if (!broadcast) {
    return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  }

  const incident = (broadcast as Record<string, unknown>).incidents as Record<string, unknown>;
  const incidentId = incident.id as string;

  if (decision === 'ACCEPT') {
    // Mark broadcast accepted
    await supabase.from('incident_broadcasts').update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    }).eq('id', broadcast_id);

    // Mark incident accepted by this institute
    await supabase.from('incidents').update({
      status: 'accepted',
      accepted_by: broadcast.institute_id,
      updated_at: new Date().toISOString(),
    }).eq('id', incidentId);

    return NextResponse.json({
      incident_id: incidentId,
      status: 'accepted',
      decision: 'ACCEPT',
    });
  }

  // REJECT — mark broadcast rejected, add to exclude list
  await supabase.from('incident_broadcasts').update({
    status: 'rejected',
    responded_at: new Date().toISOString(),
  }).eq('id', broadcast_id);

  // Add to exclude list and re-broadcast
  const currentExcludeList = (incident.exclude_list as string[]) || [];
  const newExcludeList = [...currentExcludeList, broadcast.institute_id];

  await supabase.from('incidents').update({
    exclude_list: newExcludeList,
    status: 'broadcasting',
    updated_at: new Date().toISOString(),
  }).eq('id', incidentId);

  // Find next nearest institute (excluding rejected ones)
  const { data: institutes } = await supabase
    .from('institutes')
    .select('*')
    .eq('is_available', true);

  const available = (institutes || []).filter(
    (inst) => !newExcludeList.includes(inst.id)
  );

  if (available.length === 0) {
    return NextResponse.json({
      incident_id: incidentId,
      status: 'no_responders',
      decision: 'REJECT',
    });
  }

  const incLat = (incident.lat as number) || 24.8607;
  const incLng = (incident.lng as number) || 67.0011;

  const nearest = available.reduce((best, inst) => {
    const d = haversine(incLat, incLng, inst.lat, inst.lng);
    const dBest = haversine(incLat, incLng, best.lat, best.lng);
    return d < dBest ? inst : best;
  });

  // Create new broadcast
  await supabase.from('incident_broadcasts').insert({
    incident_id: incidentId,
    institute_id: nearest.id,
    status: 'pending',
    confidence: 0.92,
  });

  return NextResponse.json({
    incident_id: incidentId,
    status: 'broadcasting',
    decision: 'REJECT',
    next_institute: nearest.name,
  });
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
