import { NextRequest, NextResponse } from 'next/server';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// Text/demo path: create incident + run graph (pauses at pivot)
export async function POST(req: NextRequest) {
  const { transcript } = await req.json();

  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'Empty transcript' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({ transcript, status: 'intake' })
    .select()
    .single();

  if (error || !incident) {
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }

  const graph = buildWaastaGraph();

  try {
    const result = await graph.invoke({
      transcript,
      incident_id: incident.id,
    });

    return NextResponse.json({
      incident_id: incident.id,
      status: result.status,
      broadcast_id: result.broadcast_id || null,
      landmark: result.landmark_match?.name || null,
      lat: result.incident_card?.lat || null,
      lng: result.incident_card?.lng || null,
    });
  } catch (err) {
    await supabase.from('incidents').update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', incident.id);

    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
