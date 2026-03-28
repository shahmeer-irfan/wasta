import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/client';
import { simulateMovement } from '@/lib/simulation';
import { fetchOSRMRoute, straightLineWaypoints } from '@/lib/routing';

export const dynamic = 'force-dynamic';

// Institution dispatches an ambulance to an accepted incident
export async function POST(req: NextRequest) {
  const { incident_id, institute_id } = await req.json();

  console.log('[DISPATCH] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[DISPATCH] incident:', incident_id, 'institute:', institute_id);

  if (!incident_id || !institute_id) {
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

  // Find ALL available resources and pick the closest one
  const { data: availableResources } = await supabase
    .from('resources')
    .select('*')
    .eq('institute_id', institute_id)
    .eq('status', 'available');

  if (!availableResources || availableResources.length === 0) {
    return NextResponse.json({ error: 'No available resources' }, { status: 409 });
  }

  const targetLat = incident.lat ?? 24.8607;
  const targetLng = incident.lng ?? 67.0011;

  // Sort by straight-line distance
  const sorted = [...availableResources].sort((a, b) => {
    const distA = Math.sqrt(Math.pow(a.lat - targetLat, 2) + Math.pow(a.lng - targetLng, 2));
    const distB = Math.sqrt(Math.pow(b.lat - targetLat, 2) + Math.pow(b.lng - targetLng, 2));
    return distA - distB;
  });

  const resource = sorted[0];
  console.log(`[DISPATCH] Selected closest resource: ${resource.call_sign} (ID: ${resource.id.substring(0,8)})`);

  // ── Fetch real road route from OSRM ──
  console.log('[DISPATCH] Fetching OSRM route...');
  const osrmRoute = await fetchOSRMRoute(resource.lat, resource.lng, targetLat, targetLng);

  let waypoints: [number, number][];
  let distanceKm: number;
  let durationMin: number;

  if (osrmRoute) {
    waypoints = osrmRoute.waypoints;
    distanceKm = osrmRoute.distanceKm;
    durationMin = osrmRoute.durationMin;
    console.log(`[DISPATCH] OSRM route: ${distanceKm}km, ${durationMin}min, ${waypoints.length} waypoints`);
  } else {
    waypoints = straightLineWaypoints(resource.lat, resource.lng, targetLat, targetLng, 25);
    distanceKm = Math.round(Math.sqrt(
      Math.pow((targetLat - resource.lat) * 111, 2) +
      Math.pow((targetLng - resource.lng) * 111 * Math.cos(resource.lat * Math.PI / 180), 2)
    ) * 10) / 10;
    durationMin = Math.max(1, Math.round((distanceKm / 30) * 60));
    console.log(`[DISPATCH] Straight-line fallback: ${distanceKm}km, ${durationMin}min`);
  }

  // Assign resource + store route + mark dispatched
  await supabase.from('resources')
    .update({ status: 'dispatched', updated_at: new Date().toISOString() })
    .eq('id', resource.id);

  await supabase.from('incidents')
    .update({
      assigned_resource: resource.id,
      status: 'dispatched',
      route_waypoints: waypoints,
      route_distance_km: distanceKm,
      route_duration_min: durationMin,
      route_progress_step: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', incident_id);

  // Start simulation along waypoints (non-blocking)
  simulateMovement({
    resourceId: resource.id,
    incidentId: incident_id,
    waypoints,
    intervalMs: 2000,
  }).catch(console.error);

  return NextResponse.json({
    success: true,
    resource_id: resource.id,
    call_sign: resource.call_sign,
    incident_id,
    route_distance_km: distanceKm,
    route_duration_min: durationMin,
    waypoint_count: waypoints.length,
  });
}
