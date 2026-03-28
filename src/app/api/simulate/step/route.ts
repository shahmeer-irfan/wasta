import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// Client calls this every 2s to advance an ambulance by one waypoint
export async function POST(req: NextRequest) {
  const { incident_id } = await req.json();

  if (!incident_id) {
    return NextResponse.json({ error: 'Missing incident_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch incident with route data
  const { data: incident } = await supabase
    .from('incidents')
    .select('route_waypoints, route_progress_step, assigned_resource, status')
    .eq('id', incident_id)
    .single();

  if (!incident || !incident.route_waypoints || !incident.assigned_resource) {
    return NextResponse.json({ done: true, reason: 'no_route' });
  }

  // Already arrived or resolved
  if (['on_scene', 'resolved', 'cancelled'].includes(incident.status)) {
    return NextResponse.json({ done: true, status: incident.status });
  }

  const waypoints = incident.route_waypoints as [number, number][];
  const currentStep = (incident.route_progress_step ?? 0) + 1;
  const totalSteps = waypoints.length - 1;

  if (currentStep > totalSteps) {
    return NextResponse.json({ done: true, status: 'on_scene' });
  }

  const [lat, lng] = waypoints[currentStep];
  const isLast = currentStep >= totalSteps;

  // Move resource — ONLY if it hasn't been manually freed (Recall)
  const { data: resData } = await supabase.from('resources').update({
    lat,
    lng,
    status: isLast ? 'on_scene' : 'en_route',
    updated_at: new Date().toISOString(),
  }).eq('id', incident.assigned_resource)
    .neq('status', 'available')
    .select('id');

  if (!resData || resData.length === 0) {
    console.log(`[SIM] Aborting simulation for incident ${incident_id}: Resource was manually freed.`);
    return NextResponse.json({ done: true, reason: 'resource_freed' });
  }

  // Update progress
  await supabase.from('incidents').update({
    route_progress_step: currentStep,
    ...(isLast ? { status: 'on_scene' } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', incident_id);

  return NextResponse.json({
    done: isLast,
    step: currentStep,
    total: totalSteps,
    status: isLast ? 'on_scene' : 'en_route',
    lat,
    lng,
  });
}
