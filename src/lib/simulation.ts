// ============================================================
// WAASTA — Simulation Engine
// Smooth LERP movement for ambulance icons on map
// ============================================================

import { createServiceClient } from '@/lib/supabase/client';

interface SimulationConfig {
  resourceId: string;
  startLat: number;
  startLng: number;
  targetLat: number;
  targetLng: number;
  intervalMs?: number;
  steps?: number;
}

// Linear interpolation
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export async function simulateMovement({
  resourceId,
  startLat,
  startLng,
  targetLat,
  targetLng,
  intervalMs = 2000,
  steps = 30,
}: SimulationConfig): Promise<void> {
  const supabase = createServiceClient();

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const lat = lerp(startLat, targetLat, t);
    const lng = lerp(startLng, targetLng, t);

    await supabase.from('resources').update({
      lat,
      lng,
      status: i === steps ? 'on_scene' : 'en_route',
      updated_at: new Date().toISOString(),
    }).eq('id', resourceId);

    if (i < steps) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

// Client-side simulation trigger
export async function triggerSimulation(
  resourceId: string,
  targetLat: number,
  targetLng: number
): Promise<void> {
  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resourceId, targetLat, targetLng }),
  });

  if (!response.ok) {
    console.error('Simulation trigger failed');
  }
}
