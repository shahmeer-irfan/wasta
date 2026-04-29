'use client';

import { useMemo } from 'react';
import { Map, MapMarker, MarkerContent, MarkerPopup, MapControls, MapRoute, MapFitBounds } from '@/components/ui/map';
import { KARACHI_CENTER } from '@/lib/constants';
import { waypointsToGeoJSON } from '@/lib/routing';
import { Hospital, Warehouse, Ambulance, Flame, Shield, Activity } from 'lucide-react';

const ICON_MAP = {
  hospital: Hospital,
  station: Warehouse,
  ambulance: Ambulance,
  fire: Flame,
  police: Shield,
  incident: Activity,
};

export interface MapMarkerData {
  lat: number;
  lng: number;
  iconType?: 'incident' | 'ambulance' | 'institute' | 'offline' | 'arrived' | 'deployed' | 'active';
  iconName?: keyof typeof ICON_MAP;
  popup?: string;
}

export type { MapMarkerData as MapMarker };

const ICON_STYLES: Record<string, { bg: string; border: string; size: string; iconSize: string; ping?: boolean }> = {
  offline:   { bg: 'bg-red-500',     border: 'border-white',      size: 'h-8 w-8',   iconSize: 'w-5 h-5', ping: true },
  arrived:   { bg: 'bg-emerald-500', border: 'border-emerald-500',size: 'h-6 w-6',   iconSize: 'w-4 h-4' },
  deployed:  { bg: 'bg-orange-500',  border: 'border-orange-500', size: 'h-6 w-6',   iconSize: 'w-4 h-4' },
  active:    { bg: 'bg-blue-500',    border: 'border-blue-500',   size: 'h-6 w-6',   iconSize: 'w-4 h-4' },
  incident:  { bg: 'bg-red-500',     border: 'border-white',      size: 'h-8 w-8',   iconSize: 'w-5 h-5', ping: true },
  ambulance: { bg: 'bg-emerald-500', border: 'border-emerald-500',size: 'h-6 w-6',   iconSize: 'w-4 h-4' },
  institute: { bg: 'bg-zinc-800',    border: 'border-white',     size: 'h-9 w-9',   iconSize: 'w-5.5 h-5.5' },
  default:   { bg: 'bg-orange-500',  border: 'border-orange-500', size: 'h-6 w-6',   iconSize: 'w-4 h-4' },
};

interface WaastaMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarkerData[];
  flyTo?: { lat: number; lng: number } | null;
  className?: string;
  theme?: 'light' | 'ink';
  interactive?: boolean;
  // Route props
  routeWaypoints?: [number, number][] | null;  // [lat, lng] pairs
  routeProgressStep?: number | null;
}

export default function WaastaMap({
  center = KARACHI_CENTER,
  zoom = 13,
  markers = [],
  className = 'h-full w-full',
  theme = 'light',
  interactive = true,
  routeWaypoints,
  routeProgressStep,
}: WaastaMapProps) {
  // Convert waypoints to GeoJSON [lng, lat] for MapLibre
  const fullRouteCoords = useMemo(() => {
    if (!routeWaypoints || routeWaypoints.length < 2) return null;
    return waypointsToGeoJSON(routeWaypoints);
  }, [routeWaypoints]);

  const progressCoords = useMemo(() => {
    if (!routeWaypoints || routeWaypoints.length < 2) return null;
    const step = routeProgressStep ?? 0;
    if (step < 1) return null;
    const travelled = routeWaypoints.slice(0, step + 1);
    if (travelled.length < 2) return null;
    return waypointsToGeoJSON(travelled);
  }, [routeWaypoints, routeProgressStep]);

  return (
    <div className={className}>
      <Map
        center={[center.lng, center.lat]}
        zoom={zoom}
        theme={theme === 'ink' ? 'dark' : 'light'}
        interactive={interactive}
        dragPan={interactive}
        scrollZoom={interactive}
        doubleClickZoom={interactive}
        touchZoomRotate={interactive}
        keyboard={interactive}
      >
        {interactive && <MapControls position="bottom-right" showZoom />}

        {/* Auto-zoom to show full route */}
        {fullRouteCoords && <MapFitBounds coordinates={fullRouteCoords} />}

        {/* Full route — gray base line (the road path) */}
        {fullRouteCoords && (
          <MapRoute
            coordinates={fullRouteCoords}
            color="#9ca3af"
            width={6}
            opacity={0.5}
          />
        )}

        {/* Progress line — orange, shows distance covered (like Uber) */}
        {progressCoords && (
          <MapRoute
            coordinates={progressCoords}
            color="#ea580c"
            width={6}
            opacity={1}
          />
        )}

        {/* Markers */}
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
                  {style.ping && (
                    <div className={`absolute ${style.size} rounded-full ${style.bg} opacity-40 animate-ping`} />
                  )}
                  <div className={`relative ${style.size} rounded-full ${style.bg} ${style.border} shadow-xl flex items-center justify-center ${
                    ['arrived', 'deployed', 'active', 'ambulance'].includes(m.iconType || '') 
                      ? 'border-[5px] bg-opacity-20 backdrop-blur-[1px]' 
                      : 'border-2'
                  }`}>
                    {m.iconName && ICON_MAP[m.iconName] && !['arrived', 'deployed', 'active', 'ambulance'].includes(m.iconType || '') && (() => {
                      const IconComp = ICON_MAP[m.iconName];
                      return <IconComp className={`${style.iconSize} text-white`} />;
                    })()}
                  </div>
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
