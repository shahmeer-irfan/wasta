export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Waasta-Emergency-Response-App/1.0',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!res.ok) return 'GPS Location';
    
    const data = await res.json();
    
    // Try to extract the most human-readable short address parts
    if (data.address) {
      const { address } = data;
      const parts = [
        address.road || address.pedestrian || address.neighbourhood,
        address.suburb || address.residential || address.city_district,
        address.city || address.town || address.county
      ].filter(Boolean);
      
      if (parts.length > 0) {
        // Return up to two distinct components to keep it short (e.g. "Main Street, Gulshan-e-Iqbal")
        return Array.from(new Set(parts)).slice(0, 2).join(', ');
      }
    }
    
    // Fallback if specific structured parts aren't cleanly available
    if (data.display_name) {
      return data.display_name.split(',').slice(0, 2).join(',');
    }
  } catch (error) {
    console.warn('[GEOCODE] Reverse geocoding failed:', error);
  }
  
  return 'GPS Location';
}
