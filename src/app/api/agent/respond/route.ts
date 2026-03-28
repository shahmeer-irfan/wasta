import { NextRequest, NextResponse } from 'next/server';
import { buildVaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';
import type { Incident, Institute } from '@/types';

export const dynamic = 'force-dynamic';

// HITL endpoint — Institute accepts or rejects a broadcast
export async function POST(req: NextRequest) {
  const { broadcast_id, decision } = await req.json();

  if (!broadcast_id || !['ACCEPT', 'REJECT'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch broadcast + incident details
  const { data: broadcast } = await supabase
    .from('incident_broadcasts')
    .select('*, incidents(*), institutes(*)')
    .eq('id', broadcast_id)
    .single();

  if (!broadcast) {
    return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  }

  const incident = (broadcast as Record<string, unknown>).incidents as Incident;
  const institute = (broadcast as Record<string, unknown>).institutes as Institute;

  // Resume graph from pivot node
  const graph = buildVaastaGraph();

  try {
    const result = await graph.invoke({
      transcript: incident.transcript || '',
      caller_phone: incident.caller_phone || '',
      incident_id: incident.id,
      incident_card: {
        incident_type: incident.incident_type,
        summary: incident.summary || '',
        severity: incident.severity ?? 3,
        landmark: incident.landmark,
        lat: incident.lat,
        lng: incident.lng,
        zone: incident.zone,
      },
      landmark_match: (incident.landmark && incident.lat && incident.lng) ? {
        name: incident.landmark,
        lat: incident.lat,
        lng: incident.lng,
        zone: incident.zone || '',
      } : null,
      broadcast_id,
      target_institute_id: institute.id,
      target_institute_phone: institute.phone,
      exclude_list: incident.exclude_list || [],
      pivot_decision: decision,
      status: 'waiting_response',
    });

    // If accepted, assign the nearest available resource
    if (decision === 'ACCEPT') {
      const { data: resource } = await supabase
        .from('resources')
        .select('*')
        .eq('institute_id', institute.id)
        .eq('status', 'available')
        .limit(1)
        .single();

      if (resource) {
        await supabase.from('resources').update({ status: 'dispatched' }).eq('id', resource.id);
        await supabase.from('incidents').update({
          assigned_resource: resource.id,
          status: 'dispatched',
        }).eq('id', incident.id);
      }
    }

    return NextResponse.json({
      incident_id: incident.id,
      status: result.status,
      decision,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
