import { NextRequest, NextResponse } from 'next/server';
import { simulateMovement } from '@/lib/simulation';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { resourceId, targetLat, targetLng } = await req.json();

  const supabase = createServiceClient();

  // Get current resource position
  const { data: resource } = await supabase
    .from('resources')
    .select('*')
    .eq('id', resourceId)
    .single();

  if (!resource) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  // Run simulation in background (non-blocking)
  simulateMovement({
    resourceId,
    startLat: resource.lat,
    startLng: resource.lng,
    targetLat,
    targetLng,
    intervalMs: 2000,
    steps: 25,
  }).catch(console.error);

  return NextResponse.json({ status: 'simulation_started', resourceId });
}
