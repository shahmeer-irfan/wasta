// ============================================================
// WAASTA — Simulation Engine
// Follows real road waypoints from OSRM (or straight-line fallback)
// ============================================================

import { createServiceClient } from '@/lib/supabase/client';

interface SimulationConfig {
  resourceId: string;
  incidentId: string;
  waypoints: [number, number][]; // [lat, lng] pairs along the route
  intervalMs?: number;
}

export async function simulateMovement({
  resourceId,
  incidentId,
  waypoints,
  intervalMs = 2000,
}: SimulationConfig): Promise<void> {
  const supabase = createServiceClient();
  const totalSteps = waypoints.length - 1;

  if (totalSteps < 1) return;

  console.log(`[SIMULATION] Starting: ${totalSteps} waypoints, ${intervalMs}ms interval`);

  // Mark en_route
  await supabase.from('incidents').update({
    status: 'en_route',
    route_progress_step: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', incidentId);

  for (let step = 1; step <= totalSteps; step++) {
    const [lat, lng] = waypoints[step];
    const isLast = step === totalSteps;

    // Move resource along waypoint
    await supabase.from('resources').update({
      lat,
      lng,
      status: isLast ? 'on_scene' : 'en_route',
      updated_at: new Date().toISOString(),
    }).eq('id', resourceId);

    // Update route progress (drives the orange progress line on both maps)
    await supabase.from('incidents').update({
      route_progress_step: step,
      ...(isLast ? { status: 'on_scene' } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', incidentId);

    if (!isLast) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  console.log('[SIMULATION] Arrived on scene');
}
