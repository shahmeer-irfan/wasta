import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/client';
import { simulateMovement } from '@/lib/simulation';

export const dynamic = 'force-dynamic';

// Institution dispatches an ambulance to an accepted incident
export async function POST(req: NextRequest) {
  const { incident_id, institute_id } = await req.json();

  console.log('[DISPATCH] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[DISPATCH] incident:', incident_id, 'institute:', institute_id);

  if (!incident_id || !institute_id) {
    console.error('[DISPATCH] Missing params');
    return NextResponse.json({ error: 'Missing incident_id or institute_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: incident } = await supabase
    .from('incidents')
    .select('*')
    .eq('id', incident_id)
    .single();

  if (!incident) {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }

  // Find available resource from this institute
  const { data: resource } = await supabase
    .from('resources')
    .select('*')
    .eq('institute_id', institute_id)
    .eq('status', 'available')
    .limit(1)
    .single();

  if (!resource) {
    return NextResponse.json({ error: 'No available resources' }, { status: 409 });
  }

  // Assign resource + mark dispatched
  await supabase.from('resources')
    .update({ status: 'dispatched', updated_at: new Date().toISOString() })
    .eq('id', resource.id);

  await supabase.from('incidents')
    .update({
      assigned_resource: resource.id,
      status: 'dispatched',
      updated_at: new Date().toISOString(),
    })
    .eq('id', incident_id);

  // Start simulation (non-blocking)
  const targetLat = incident.lat ?? 24.8607;
  const targetLng = incident.lng ?? 67.0011;

  simulateMovement({
    resourceId: resource.id,
    incidentId: incident_id,
    startLat: resource.lat,
    startLng: resource.lng,
    targetLat,
    targetLng,
    intervalMs: 2000,
    steps: 25,
  }).catch(console.error);

  return NextResponse.json({
    success: true,
    resource_id: resource.id,
    call_sign: resource.call_sign,
    incident_id,
  });
}
