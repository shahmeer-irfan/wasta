import { NextRequest, NextResponse } from 'next/server';
import { simulateMovement } from '@/lib/simulation';
import { createServiceClient } from '@/lib/supabase/client';
import { straightLineWaypoints } from '@/lib/routing';

export const dynamic = 'force-dynamic';

// Legacy simulation endpoint — dispatch route now handles this directly
export async function POST(req: NextRequest) {
  const { resourceId, incidentId, targetLat, targetLng } = await req.json();

  if (!resourceId) {
    return NextResponse.json({ error: 'Missing resourceId' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: resource } = await supabase
    .from('resources')
    .select('*')
    .eq('id', resourceId)
    .single();

  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  const waypoints = straightLineWaypoints(
    resource.lat, resource.lng,
    targetLat ?? resource.lat, targetLng ?? resource.lng,
    25
  );

  simulateMovement({
    resourceId,
    incidentId: incidentId || '',
    waypoints,
    intervalMs: 2000,
  }).catch(console.error);

  return NextResponse.json({ status: 'simulation_started', resourceId });
}
