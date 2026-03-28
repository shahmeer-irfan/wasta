'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { KARACHI_CENTER } from '@/lib/constants';

const PING_ANIMATION = `
  @keyframes map-ping {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(3.5); opacity: 0; }
  }
`;

// Icon factory — only called client-side
function createIcon(color: string, size: number = 12, isPing: boolean = false): L.DivIcon {
  const pingHtml = isPing ? `<div style="
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    border-radius: 50%;
    background: ${color};
    animation: map-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  "></div>` : '';

  return L.divIcon({
    className: '',
    html: `<div style="position: relative; width: ${size}px; height: ${size}px;">
      ${pingHtml}
      <div style="
        position: relative;
        z-index: 10;
        width: 100%; height: 100%;
        background: ${color};
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.7);
        box-shadow: 0 0 ${size}px ${color}88;
      "></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const ICON_MAP: Record<string, { color: string; size: number }> = {
  incident: { color: '#dc2626', size: 16 },
  ambulance: { color: '#22c55e', size: 14 },
  institute: { color: '#3b82f6', size: 10 },
  default: { color: '#dc2626', size: 12 },
};

// Auto-pan to a position
function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], zoom ?? 14, { duration: 1.5 });
    }
  }, [lat, lng, zoom, map]);
  return null;
}

export interface MapMarker {
  lat: number;
  lng: number;
  iconType?: 'incident' | 'ambulance' | 'institute';
  popup?: string;
}

interface MapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  flyTo?: { lat: number; lng: number } | null;
  className?: string;
}

export default function WaastaMap({
  center = KARACHI_CENTER,
  zoom = 12,
  markers = [],
  flyTo,
  className = 'h-full w-full',
}: MapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`${className} bg-orange-50 flex items-center justify-center`}>
        <div className="text-zinc-600 text-sm">Loading map...</div>
      </div>
    );
  }

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className={className}
      zoomControl={false}
      attributionControl={false}
    >
      <style>{PING_ANIMATION}</style>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      {flyTo && <FlyTo lat={flyTo.lat} lng={flyTo.lng} />}
      {markers.map((m, i) => {
        const iconConf = ICON_MAP[m.iconType || 'default'];
        const isPing = m.iconType === 'incident';
        return (
          <Marker key={`${i}-${m.lat}-${m.lng}`} position={[m.lat, m.lng]} icon={createIcon(iconConf.color, iconConf.size, isPing)}>
            {m.popup && (
              <Popup>
                <span className="text-xs text-zinc-900">{m.popup}</span>
              </Popup>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
