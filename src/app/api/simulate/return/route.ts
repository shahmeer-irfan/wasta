import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// Move ambulance one waypoint BACK toward station
export async function POST(req: NextRequest) {
  const { incident_id } = await req.json();

  if (!incident_id) {
    return NextResponse.json({ error: 'Missing incident_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: incident } = await supabase
    .from('incidents')
    .select('route_waypoints, route_progress_step, assigned_resource, status')
    .eq('id', incident_id)
    .single();

  if (!incident || !incident.route_waypoints || !incident.assigned_resource) {
    return NextResponse.json({ done: true, reason: 'no_data' });
  }

  if (!['on_scene', 'returning'].includes(incident.status ?? '')) {
    return NextResponse.json({ done: true, reason: 'wrong_status' });
  }

  const waypoints = incident.route_waypoints as [number, number][];
  const currentStep = (incident.route_progress_step ?? waypoints.length - 1) - 1;

  // Back at station
  if (currentStep <= 0) {
    const [lat, lng] = waypoints[0];

    await supabase.from('resources').update({
      lat, lng, status: 'available',
      updated_at: new Date().toISOString(),
    }).eq('id', incident.assigned_resource);

    await supabase.from('incidents').update({
      status: 'resolved',
      route_progress_step: 0,
      updated_at: new Date().toISOString(),
    }).eq('id', incident_id);

    return NextResponse.json({ done: true, status: 'resolved' });
  }

  const [lat, lng] = waypoints[currentStep];

  await supabase.from('resources').update({
    lat, lng, status: 'returning',
    updated_at: new Date().toISOString(),
  }).eq('id', incident.assigned_resource);

  await supabase.from('incidents').update({
    route_progress_step: currentStep,
    status: 'returning',
    updated_at: new Date().toISOString(),
  }).eq('id', incident_id);

  return NextResponse.json({
    done: false,
    step: currentStep,
    total: waypoints.length - 1,
    status: 'returning',
  });
}
