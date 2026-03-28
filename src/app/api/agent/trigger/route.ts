import { NextRequest, NextResponse } from 'next/server';
import { buildGuardianGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { transcript, caller_phone } = await req.json();
  const supabase = createServiceClient();

  // Create incident record
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      caller_phone,
      transcript,
      status: 'intake',
    })
    .select()
    .single();

  if (error || !incident) {
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }

  // Run the graph (will pause at pivot node)
  const graph = buildGuardianGraph();

  try {
    const result = await graph.invoke({
      transcript,
      caller_phone: caller_phone || '',
      incident_id: incident.id,
    });

    return NextResponse.json({
      incident_id: incident.id,
      status: result.status,
      broadcast_id: result.broadcast_id,
      landmark: result.landmark_match?.name,
      lat: result.incident_card?.lat,
      lng: result.incident_card?.lng,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
