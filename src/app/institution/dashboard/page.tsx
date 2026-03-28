'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Radio, MapPin, Clock, Ambulance,
  Flame, AlertTriangle, Car, Heart, HelpCircle, Loader2, ChevronLeft
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BroadcastModal from '@/components/institution/BroadcastModal';
import VoiceChat from '@/components/shared/VoiceChat';
import { useInstitutionStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '@/lib/constants';
import type { MapMarker } from '@/components/maps/WaastaMap';
import type { Incident, IncidentBroadcast, Institute, Resource } from '@/types';

const WaastaMap = dynamic(() => import('@/components/maps/WaastaMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-orange-50 animate-pulse" />,
});

const DEMO_INSTITUTE_ID_KEY = 'waasta_institute_id';

// Icon map for incident types
const INCIDENT_ICONS: Record<string, React.ReactNode> = {
  accident:  <Car className="w-3.5 h-3.5" />,
  fire:      <Flame className="w-3.5 h-3.5" />,
  medical:   <Heart className="w-3.5 h-3.5" />,
  crime:     <AlertTriangle className="w-3.5 h-3.5" />,
  other:     <HelpCircle className="w-3.5 h-3.5" />,
};

// Human-readable status labels + colors
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  intake:       { label: 'Processing', cls: 'text-blue-400 border-blue-600/30 bg-blue-600/10' },
  geocoded:     { label: 'Located',    cls: 'text-cyan-400 border-cyan-600/30 bg-cyan-600/10' },
  broadcasting: { label: 'Alerting',   cls: 'text-amber-400 border-amber-600/30 bg-amber-600/10' },
  accepted:     { label: 'Accepted',   cls: 'text-emerald-400 border-emerald-600/30 bg-emerald-600/10' },
  dispatched:   { label: 'Dispatched', cls: 'text-green-400 border-green-600/30 bg-green-600/10' },
  resolved:     { label: 'Resolved',   cls: 'text-zinc-600 border-orange-300/30 bg-zinc-600/10' },
  cancelled:    { label: 'Cancelled',  cls: 'text-zinc-500 border-orange-200/30 bg-orange-100/10' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function InstitutionDashboard() {
  const store = useInstitutionStore();
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [, setTick] = useState(0); // for live time updates

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Initialize — always fetch fresh institute from DB
  useEffect(() => {
    async function init() {
      const { data, error } = await supabase
        .from('institutes')
        .select('*')
        .eq('is_available', true)
        .limit(1)
        .single();

      console.log('[DASHBOARD] Institute fetch:', data?.name || 'NONE', error?.message || '');

      if (data) {
        localStorage.setItem(DEMO_INSTITUTE_ID_KEY, data.id);
        setInstitute(data as Institute);
        setInstituteId(data.id);
        console.log('[DASHBOARD] Institute ID set:', data.id.substring(0, 8));
      } else {
        console.error('[DASHBOARD] No institute found! Run schema_v2.sql in Supabase.');
      }
    }
    init();
  }, []);

  // Fetch resources and active incidents
  useEffect(() => {
    if (!instituteId) return;

    async function fetchData() {
      const [resRes, incRes] = await Promise.all([
        supabase.from('resources').select('*').eq('institute_id', instituteId!),
        supabase
          .from('incidents')
          .select('*')
          .not('status', 'in', '("resolved","cancelled")')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (resRes.data) setResources(resRes.data as Resource[]);
      if (incRes.data) setAllIncidents(incRes.data as Incident[]);

      // Check for any PENDING broadcasts that already exist (page loaded late)
      const { data: pendingBroadcasts } = await supabase
        .from('incident_broadcasts')
        .select('*, incidents(*)')
        .eq('institute_id', instituteId!)
        .eq('status', 'pending')
        .order('sent_at', { ascending: false })
        .limit(1);

      if (pendingBroadcasts?.length) {
        const b = pendingBroadcasts[0];
        const inc = (b as Record<string, unknown>).incidents;
        if (inc) {
          store.setActiveBroadcast({
            ...b,
            incidents: inc as Incident,
          });
        }
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instituteId]);

  // Listen for new broadcasts targeting this institute
  useEffect(() => {
    if (!instituteId) return;

    console.log('[DASHBOARD] Subscribing to broadcasts for institute:', instituteId.substring(0, 8));

    const channel = supabase
      .channel(`broadcasts-${instituteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'incident_broadcasts',
          filter: `institute_id=eq.${instituteId}`,
        },
        async (payload) => {
          console.log('[DASHBOARD] ★ NEW BROADCAST received!', payload.new);
          const broadcast = payload.new as IncidentBroadcast;

          const { data: incident } = await supabase
            .from('incidents')
            .select('*')
            .eq('id', broadcast.incident_id)
            .single();

          console.log('[DASHBOARD] Incident for broadcast:', incident?.id?.substring(0, 8), incident?.status);

          if (incident) {
            store.setActiveBroadcast({
              ...broadcast,
              incidents: incident as Incident,
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instituteId]);

  // Listen for resource updates
  useEffect(() => {
    if (!instituteId) return;

    const channel = supabase
      .channel(`inst-resources-${instituteId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'resources' },
        (payload) => {
          const updated = payload.new as Resource;
          setResources((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r))
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [instituteId]);

  // Listen for all incident changes
  useEffect(() => {
    const channel = supabase
      .channel('all-incidents-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAllIncidents((prev) => [payload.new as Incident, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAllIncidents((prev) =>
              prev.map((i) =>
                i.id === (payload.new as Incident).id ? (payload.new as Incident) : i
              )
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Handle accept/reject
  const handleResponse = useCallback(async (decision: 'ACCEPT' | 'REJECT') => {
    if (!store.activeBroadcast) return;
    setIsResponding(true);

    try {
      await fetch('/api/agent/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcast_id: store.activeBroadcast.id,
          decision,
        }),
      });
      store.clearBroadcast();
    } catch (err) {
      console.error('Response failed:', err);
    } finally {
      setIsResponding(false);
    }
  }, [store]);

  // Map markers
  const mapMarkers: MapMarker[] = [
    ...allIncidents
      .filter((i) => i.lat && i.lng)
      .map((i) => ({
        lat: i.lat!,
        lng: i.lng!,
        iconType: 'incident' as const,
        popup: `🚨 ${i.incident_type ?? 'Emergency'} @ ${i.landmark ?? 'Unknown'} [${i.status}]`,
      })),
    ...resources.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      iconType: 'ambulance' as const,
      popup: `${r.call_sign} — ${r.status}`,
    })),
    ...(institute ? [{
      lat: institute.lat,
      lng: institute.lng,
      iconType: 'institute' as const,
      popup: institute.name,
    }] : []),
  ];

  const activeIncidents = allIncidents.filter(
    (i) => !['resolved', 'cancelled'].includes(i.status)
  );
  const availableCount = resources.filter((r) => r.status === 'available').length;
  const dispatchedCount = resources.filter((r) =>
    ['dispatched', 'en_route'].includes(r.status)
  ).length;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const selectedIncidentData = selectedIncident ? activeIncidents.find(i => i.id === selectedIncident) : null;

  const onSceneCount = resources.filter(r => r.status === 'on_scene').length;

  const statTiles = [
    { label: 'Active', value: activeIncidents.length, color: '#dc2626', bg: '#fef2f2' },
    { label: 'Deployed', value: dispatchedCount, color: '#ea580c', bg: '#fff7ed' },
    { label: 'On Scene', value: onSceneCount, color: '#16a34a', bg: '#f0fdf4' },
    { label: 'Available', value: availableCount, color: '#2563eb', bg: '#eff6ff' },
  ];

  return (
    <div className="h-screen w-screen bg-white flex flex-col overflow-hidden">
      {/* Broadcast Modal */}
      <AnimatePresence>
        {store.activeBroadcast && (
          <BroadcastModal
            broadcast={store.activeBroadcast}
            onAccept={() => handleResponse('ACCEPT')}
            onReject={() => handleResponse('REJECT')}
            isResponding={isResponding}
          />
        )}
      </AnimatePresence>

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center hover:bg-orange-100 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4 text-orange-600" />
            </div>
          </Link>
          <div className="w-8 h-8 rounded-lg overflow-hidden relative shadow-sm border border-orange-200/50 shrink-0">
            <Image src="/logo.png" alt="Waasta" fill className="object-cover" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-gray-900 tracking-tight leading-none">
              WAASTA War Room
            </h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {institute ? `${institute.name} · ${institute.zone}` : 'Loading...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-[6px] h-[6px] rounded-full bg-emerald-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[11px] font-semibold text-gray-500 tracking-wide">LIVE</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-50 border border-green-200">
            <Ambulance className="w-3.5 h-3.5 text-green-600" />
            <span className="text-[11px] font-bold text-green-700">{availableCount} Avail</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200">
            <Radio className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[11px] font-bold text-amber-700">{dispatchedCount} Disp</span>
          </div>
        </div>
      </div>

      {/* ── Stats Bar ──────────────────────────────────────── */}
      <div className="grid grid-cols-4 border-b border-gray-200 shrink-0">
        {statTiles.map((tile, i) => (
          <div key={tile.label} className={`flex items-center gap-3.5 px-5 py-3 bg-white ${i < 3 ? 'border-r border-gray-100' : ''}`}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: tile.bg }}>
              <div className="w-3.5 h-3.5 rounded-full" style={{ background: tile.color }} />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none tabular-nums" style={{ color: tile.color }}>{tile.value}</div>
              <div className="text-[10px] text-gray-400 mt-1 font-medium tracking-wide uppercase">{tile.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Content: Map + Sidebar (fixed grid) ─────────── */}
      <div className="flex-1 grid grid-cols-[1fr_360px] overflow-hidden">
        {/* Map */}
        <div className="relative overflow-hidden">
          <WaastaMap
            center={institute ? { lat: institute.lat, lng: institute.lng } : undefined}
            markers={mapMarkers}
            zoom={14}
            routeWaypoints={(() => {
              const d = activeIncidents.find(i => i.route_waypoints);
              return d?.route_waypoints ?? null;
            })()}
            routeProgressStep={(() => {
              const d = activeIncidents.find(i => i.route_waypoints);
              return d?.route_progress_step ?? null;
            })()}
          />
          <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg p-2.5 shadow-sm">
            {[
              { color: '#dc2626', label: 'Incident' },
              { color: '#22c55e', label: 'Available' },
              { color: '#3b82f6', label: 'Station' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}44` }} />
                <span className="text-[10px] text-gray-500 font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sidebar (fixed 360px, no drag) ──────────────────── */}
        <div className="flex flex-col border-l border-gray-200 bg-gray-50 overflow-hidden">

          <div className="px-4 py-3 pb-2 flex items-center justify-between shrink-0 bg-white">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Active Incidents
            </h2>
            <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
              {activeIncidents.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
            <AnimatePresence initial={false}>
              {activeIncidents.map((incident) => {
                const statusCfg = STATUS_CONFIG[incident.status] ?? STATUS_CONFIG.intake;
                const isSelected = selectedIncident === incident.id;

                return (
                  <motion.div
                    key={incident.id}
                    layout
                    initial={{ opacity: 0, x: 20, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    onClick={async () => {
                      setSelectedIncident(isSelected ? null : incident.id);
                      // If broadcasting, open accept modal on click
                      if (incident.status === 'broadcasting' && !store.activeBroadcast) {
                        const { data: bc } = await supabase
                          .from('incident_broadcasts')
                          .select('*')
                          .eq('incident_id', incident.id)
                          .eq('status', 'pending')
                          .limit(1)
                          .single();
                        if (bc) {
                          store.setActiveBroadcast({ ...bc, incidents: incident });
                        }
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <Card
                      className={`relative overflow-hidden transition-all duration-300 ${
                        isSelected
                          ? 'border-[2px] border-orange-500 bg-orange-100 shadow-[0_8px_30px_rgba(249,115,22,0.25)] scale-[1.02] z-20'
                          : 'bg-white border-orange-200/60 hover:bg-orange-50 hover:border-orange-300 hover:shadow-md'
                      } p-3`}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                            incident.severity
                              ? incident.severity >= 4 ? 'bg-orange-500/20 text-orange-600' :
                                incident.severity >= 3 ? 'bg-orange-600/20 text-orange-400' :
                                'bg-yellow-600/20 text-yellow-500'
                              : 'bg-orange-100 text-zinc-500'
                          }`}>
                            {INCIDENT_ICONS[incident.incident_type ?? 'other'] ?? <HelpCircle className="w-3.5 h-3.5" />}
                          </div>
                          <span className="text-sm font-semibold text-zinc-700 capitalize">
                            {incident.incident_type
                              ? incident.incident_type.replace('_', ' ')
                              : incident.status === 'intake'
                              ? 'Processing...'
                              : 'Unknown'}
                          </span>
                        </div>
                        

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {isSelected && incident.lat && (
                            <span className="text-[10px] font-bold text-orange-600 flex items-center bg-orange-500/10 px-1.5 py-0.5 rounded animate-pulse">
                              <MapPin className="w-2.5 h-2.5 mr-0.5" /> TRACKING
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${statusCfg.cls}`}
                          >
                            {incident.status === 'intake' && (
                              <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                            )}
                            {statusCfg.label}
                          </Badge>
                        </div>
                      </div>

                      {/* Location */}
                      {incident.landmark ? (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MapPin className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span className="text-xs text-zinc-600 truncate">{incident.landmark}</span>
                          {incident.zone && (
                            <span className="text-[10px] text-zinc-500 shrink-0">· {incident.zone}</span>
                          )}
                        </div>
                      ) : incident.status === 'intake' ? (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="text-xs text-zinc-500 italic">Locating...</span>
                        </div>
                      ) : null}

                      {/* Summary — expanded view */}
                      <AnimatePresence>
                        {isSelected && incident.summary && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <p className="text-xs text-zinc-600 leading-relaxed italic mb-2 bg-orange-100/40 rounded-lg p-2.5 border border-orange-200/30">
                              &ldquo;{incident.summary}&rdquo;
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Bottom row — time + severity + resolve button */}
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        <span className="text-[10px] text-zinc-500">
                          {timeAgo(incident.created_at)}
                        </span>
                        {incident.severity && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] ml-auto ${SEVERITY_COLORS[incident.severity]} border-current/20`}
                          >
                            <Activity className="w-2.5 h-2.5 mr-1" />
                            {SEVERITY_LABELS[incident.severity]}
                          </Badge>
                        )}
                        {/* Resolve / dismiss button */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            console.log('[DASHBOARD] Resolving incident', incident.id);
                            await supabase.from('incidents').update({
                              status: 'resolved',
                              updated_at: new Date().toISOString(),
                            }).eq('id', incident.id);
                            // Free up the resource
                            if (incident.assigned_resource) {
                              await supabase.from('resources').update({
                                status: 'available',
                                updated_at: new Date().toISOString(),
                              }).eq('id', incident.assigned_resource);
                            }
                            // Remove from local state
                            setAllIncidents(prev => prev.filter(i => i.id !== incident.id));
                          }}
                          className="text-[9px] text-zinc-400 hover:text-red-500 transition-colors ml-1 px-1.5 py-0.5 rounded hover:bg-red-50"
                          title="Mark as resolved"
                        >
                          ✕
                        </button>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Empty state */}
            {activeIncidents.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center mb-3">
                  <Radio className="w-4 h-4 text-zinc-400" />
                </div>
                <p className="text-sm text-zinc-600 font-medium">All Clear</p>
                <p className="text-xs text-zinc-500 mt-1">No active incidents</p>
              </motion.div>
            )}
          </div>

          {/* ── Bottom fixed panel: resources + active dispatch ── */}
          <div className="shrink-0 border-t border-orange-200/60 bg-white max-h-[45%] overflow-y-auto">
            {/* Resources strip */}
            {resources.length > 0 && (
              <div className="px-4 py-2.5 border-b border-orange-100/60">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 font-semibold">Resources</p>
                <div className="flex flex-wrap gap-1.5">
                  {resources.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border ${
                        r.status === 'available'
                          ? 'bg-emerald-600/10 border-emerald-600/20 text-emerald-500'
                          : r.status === 'dispatched' || r.status === 'en_route'
                          ? 'bg-amber-600/10 border-amber-600/20 text-amber-500'
                          : r.status === 'on_scene'
                          ? 'bg-blue-600/10 border-blue-600/20 text-blue-500'
                          : 'bg-orange-100/50 border-orange-200/50 text-zinc-500'
                      }`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                      {r.call_sign}
                      {r.status !== 'available' && (
                        <span className="text-[8px] opacity-70">{r.status.replace('_', ' ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active dispatch — only show the MOST RECENT accepted/dispatched incident */}
            {(() => {
              const dispatchable = activeIncidents.find(i =>
                ['accepted', 'dispatched', 'en_route', 'on_scene'].includes(i.status)
              );
              if (!dispatchable) return null;

              const isDispatched = ['dispatched', 'en_route', 'on_scene'].includes(dispatchable.status);
              const assignedRes = dispatchable.assigned_resource
                ? resources.find(r => r.id === dispatchable.assigned_resource)
                : null;

              return (
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-widest font-bold" style={{
                      color: isDispatched ? '#16a34a' : '#ea580c'
                    }}>
                      {dispatchable.status === 'on_scene' ? 'On Scene'
                        : isDispatched ? 'Ambulance En Route'
                        : 'Dispatch Now'}
                    </p>
                    {isDispatched && assignedRes && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {assignedRes.call_sign}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-xs font-semibold text-zinc-800 truncate">
                      {dispatchable.landmark || 'Unknown'} {dispatchable.zone ? `· ${dispatchable.zone}` : ''}
                    </span>
                  </div>

                  {/* Voice chat — user clicks to connect */}
                  <VoiceChat
                    incidentId={dispatchable.id}
                    role="institution"
                    peerLabel="Civilian"
                  />

                  {!isDispatched ? (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={async () => {
                        console.log('[DASHBOARD] Dispatch:', dispatchable.id);
                        try {
                          const res = await fetch('/api/dispatch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ incident_id: dispatchable.id, institute_id: instituteId }),
                          });
                          const data = await res.json();
                          console.log('[DASHBOARD] Dispatch result:', data);
                          if (!res.ok) alert(`Dispatch failed: ${data.error}`);
                        } catch (err) {
                          console.error('[DASHBOARD] Dispatch error:', err);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-400 to-orange-600 text-white text-xs font-bold flex items-center justify-center gap-2 hover:from-orange-500 hover:to-orange-700 transition-all shadow-sm"
                    >
                      <Ambulance className="w-4 h-4" />
                      DISPATCH AMBULANCE
                    </motion.button>
                  ) : (
                    <div className="w-full py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center justify-center gap-2">
                      <Ambulance className="w-4 h-4" />
                      {assignedRes?.call_sign || 'AMBULANCE'} DISPATCHED
                      {dispatchable.status === 'en_route' && (
                        <motion.span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
