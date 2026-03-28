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

  // Mark both incident and resource as en_route immediately to drive UI transition
  await Promise.all([
    supabase.from('incidents').update({
      status: 'en_route',
      route_progress_step: 0,
      updated_at: new Date().toISOString(),
    }).eq('id', incidentId),
    supabase.from('resources').update({
      status: 'en_route',
      updated_at: new Date().toISOString(),
    }).eq('id', resourceId)
  ]);

  for (let step = 1; step <= totalSteps; step++) {
    const [lat, lng] = waypoints[step];
    const isLast = step === totalSteps;

    // Move resource along waypoint if it hasn't been externally aborted
    const { data: resData } = await supabase.from('resources').update({
      lat,
      lng,
      status: isLast ? 'on_scene' : 'en_route',
      updated_at: new Date().toISOString(),
    }).eq('id', resourceId)
      .neq('status', 'available')
      .select('id');

    if (!resData || resData.length === 0) {
      console.log('[SIMULATION] Resource externally freed. Aborting simulation loop.');
      return;
    }

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

  // Wait 1 minute (60,000 ms) for on-site process
  console.log('[SIMULATION] Processing on-site for 1 minute...');
  await new Promise((resolve) => setTimeout(resolve, 60000));
  
  console.log('[SIMULATION] Returning to base...');

  // Mark incident as resolved, freeing up the pipeline if not already done manually
  await supabase.from('incidents').update({
    status: 'resolved',
    updated_at: new Date().toISOString(),
  }).eq('id', incidentId);

  // Reverse waypoints for return trip
  const returnWaypoints = [...waypoints].reverse();
  const returnSteps = returnWaypoints.length - 1;

  for (let step = 1; step <= returnSteps; step++) {
    const [lat, lng] = returnWaypoints[step];
    const isLast = step === returnSteps;

    const { data: retData } = await supabase.from('resources').update({
      lat,
      lng,
      status: isLast ? 'available' : 'returning',
      updated_at: new Date().toISOString(),
    }).eq('id', resourceId)
      .neq('status', 'available')
      .select('id');

    if (!retData || retData.length === 0) {
      console.log('[SIMULATION] Resource externally freed during return trip. Aborting.');
      return;
    }

    if (!isLast) {
      // Use a faster interval for returning to speed up demo
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, intervalMs / 2)));
    }
  }

  console.log('[SIMULATION] Resource returned to base and is available again.');
}
