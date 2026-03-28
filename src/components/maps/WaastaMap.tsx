'use client';

import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls } from '@/components/ui/map';
import { KARACHI_CENTER } from '@/lib/constants';

export interface MapMarkerData {
  lat: number;
  lng: number;
  iconType?: 'incident' | 'ambulance' | 'institute';
  popup?: string;
}

// Re-export for backward compat
export type { MapMarkerData as MapMarker };

const ICON_STYLES: Record<string, { bg: string; border: string; size: string; ping?: boolean }> = {
  incident:  { bg: 'bg-red-500',     border: 'border-white',     size: 'h-4 w-4', ping: true },
  ambulance: { bg: 'bg-emerald-500', border: 'border-white',     size: 'h-3.5 w-3.5' },
  institute: { bg: 'bg-blue-500',    border: 'border-blue-200',  size: 'h-3 w-3' },
  default:   { bg: 'bg-orange-500',  border: 'border-white',     size: 'h-3.5 w-3.5' },
};

interface WaastaMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarkerData[];
  flyTo?: { lat: number; lng: number } | null;
  className?: string;
}

export default function WaastaMap({
  center = KARACHI_CENTER,
  zoom = 13,
  markers = [],
  className = 'h-full w-full',
}: WaastaMapProps) {
  return (
    <div className={className}>
      <Map
        center={[center.lng, center.lat]}
        zoom={zoom}
        theme="light"
      >
        <MapControls position="bottom-right" showZoom />

        {markers.map((m, i) => {
          const style = ICON_STYLES[m.iconType || 'default'];
          return (
            <MapMarker
              key={`${m.iconType}-${i}-${m.lat.toFixed(4)}-${m.lng.toFixed(4)}`}
              longitude={m.lng}
              latitude={m.lat}
            >
              <MarkerContent>
                <div className="relative flex items-center justify-center">
                  {/* Ping animation for incidents */}
                  {style.ping && (
                    <div className={`absolute ${style.size} rounded-full ${style.bg} opacity-40 animate-ping`} />
                  )}
                  <div className={`relative ${style.size} rounded-full ${style.bg} ${style.border} border-2 shadow-lg`} />
                </div>
              </MarkerContent>
              {m.popup && (
                <MarkerPopup>
                  <p className="text-xs font-medium">{m.popup}</p>
                </MarkerPopup>
              )}
            </MapMarker>
          );
        })}
      </Map>
    </div>
  );
}
