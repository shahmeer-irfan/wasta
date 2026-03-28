// ============================================================
// WAASTA — Road Route Calculator (OSRM + fallback)
// Free, no API key, real Karachi road network
// ============================================================

export interface RouteResult {
  coordinates: [number, number][]; // [lng, lat] pairs (GeoJSON order) for MapLibre
  waypoints: [number, number][];   // [lat, lng] pairs for Supabase/simulation
  distanceKm: number;
  durationMin: number;
}

/**
 * Fetch real road route between two points using OSRM public server.
 * Returns null if OSRM is unreachable (caller should fall back to straight line).
 */
export async function fetchOSRMRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RouteResult | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromLng},${fromLat};${toLng},${toLat}` +
      `?overview=full&geometries=geojson&steps=false`;

    console.log('[OSRM] Fetching route:', url);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route found');

    const route = data.routes[0];
    const coords = route.geometry.coordinates as [number, number][]; // [lng, lat]

    // Convert to [lat, lng] for simulation/Supabase
    const waypoints: [number, number][] = coords.map(
      ([lng, lat]) => [lat, lng]
    );

    const result: RouteResult = {
      coordinates: coords,
      waypoints,
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
    };

    console.log(`[OSRM] Route: ${result.distanceKm}km, ${result.durationMin}min, ${waypoints.length} waypoints`);
    return result;
  } catch (err) {
    console.warn('[OSRM] Route fetch failed, will use straight line:', err);
    return null;
  }
}

/**
 * Fallback: generate straight-line waypoints between two points.
 */
export function straightLineWaypoints(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  steps: number = 25
): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return [
      fromLat + (toLat - fromLat) * t,
      fromLng + (toLng - fromLng) * t,
    ] as [number, number];
  });
}

/**
 * Convert [lat, lng] waypoints to [lng, lat] GeoJSON coordinates for MapLibre.
 */
export function waypointsToGeoJSON(waypoints: [number, number][]): [number, number][] {
  return waypoints.map(([lat, lng]) => [lng, lat]);
}
