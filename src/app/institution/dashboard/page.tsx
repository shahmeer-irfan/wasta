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
import CallPanel from '@/components/institution/CallPanel';
import { useInstitutionStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '@/lib/constants';
const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || '';
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

  // Initialize — fetch or assign institute
  useEffect(() => {
    async function init() {
      let id = localStorage.getItem(DEMO_INSTITUTE_ID_KEY);

      if (!id) {
        const { data } = await supabase
          .from('institutes')
          .select('*')
          .limit(1)
          .single();
        if (data) {
          id = data.id;
          localStorage.setItem(DEMO_INSTITUTE_ID_KEY, id!);
          setInstitute(data as Institute);
        }
      } else {
        const { data } = await supabase
          .from('institutes')
          .select('*')
          .eq('id', id)
          .single();
        if (data) setInstitute(data as Institute);
      }

      if (id) setInstituteId(id);
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
    }
    fetchData();
  }, [instituteId]);

  // Listen for new broadcasts targeting this institute
  useEffect(() => {
    if (!instituteId) return;

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
          const broadcast = payload.new as IncidentBroadcast;

          const { data: incident } = await supabase
            .from('incidents')
            .select('*')
            .eq('id', broadcast.incident_id)
            .single();

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
      iconType: r.status === 'available' ? 'ambulance' as const : 'incident' as const,
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

  const selectedIncidentData = selectedIncident ? activeIncidents.find(i => i.id === selectedIncident) : null;
  const flyToPos = selectedIncidentData?.lat && selectedIncidentData?.lng
    ? { lat: selectedIncidentData.lat, lng: selectedIncidentData.lng }
    : undefined;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-5 py-3 border-b border-orange-200/60 bg-white/90 backdrop-blur-sm shrink-0 gap-3 sm:gap-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center hover:bg-orange-100 transition-colors cursor-pointer shrink-0">
              <ChevronLeft className="w-4 h-4 text-orange-600" />
            </div>
          </Link>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm border border-orange-200/50">
            <Image src="/logo.png" alt="Waasta" fill className="object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-zinc-900 tracking-tight leading-none truncate">
              WAASTA WAR ROOM
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {institute ? (
                <>{institute.name} · {institute.zone}</>
              ) : (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" /> Loading...
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide shrink-0">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs font-medium text-zinc-600 hidden sm:inline">LIVE</span>
          </div>

          <div className="w-px h-5 bg-orange-100 shrink-0 hidden sm:block" />

          <Badge variant="outline" className="text-emerald-400 border-emerald-600/30 bg-emerald-600/5 gap-1.5 text-xs shrink-0 whitespace-nowrap">
            <Ambulance className="w-3 h-3" />
            {availableCount} Avail
          </Badge>
          <Badge variant="outline" className="text-amber-400 border-amber-600/30 bg-amber-600/5 gap-1.5 text-xs shrink-0 whitespace-nowrap">
            <Radio className="w-3 h-3" />
            {dispatchedCount} Disp
          </Badge>
        </div>
      </div>

      {/* ── Stats Strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-px border-b border-orange-200/60 shrink-0 bg-orange-200/60 overflow-hidden">
        {[
          { label: 'Active', value: activeIncidents.length, color: 'text-orange-600' },
          { label: 'Resources', value: resources.length, color: 'text-zinc-500' },
          { label: 'On Scene', value: resources.filter(r => r.status === 'on_scene').length, color: 'text-blue-500' },
          { label: 'Returning', value: resources.filter(r => r.status === 'returning').length, color: 'text-zinc-600' },
        ].map((stat) => (
          <div key={stat.label} className="px-1 sm:px-4 py-2 text-center bg-white flex flex-col items-center justify-center">
            <div className={`text-sm sm:text-lg font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-[8px] sm:text-[10px] text-zinc-500 uppercase tracking-widest truncate w-full">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        {/* Map */}
        <div className="flex-1 relative min-h-[40vh] md:min-h-0 bg-orange-50">
          <WaastaMap markers={mapMarkers} zoom={12} flyTo={flyToPos} />

          {/* Map legend */}
          <div className="absolute bottom-4 left-4 right-4 md:right-auto z-[1000] flex md:flex-col gap-1.5 bg-white/90 backdrop-blur-sm border border-orange-200/60 rounded-xl p-2 md:p-3 overflow-x-auto shadow-sm">
            {[
              { color: '#dc2626', label: 'Incident' },
              { color: '#22c55e', label: 'Available' },
              { color: '#3b82f6', label: 'Station' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 shrink-0 pr-2 md:pr-0 border-r md:border-r-0 border-orange-200/50 last:border-0">
                <div
                  className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full"
                  style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}88` }}
                />
                <span className="text-[9px] md:text-[10px] text-zinc-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sidebar / Bottom Sheet ──────────────────────────── */}
        <div className="w-full md:w-80 h-[45vh] md:h-auto border-t md:border-t-0 md:border-l border-orange-200/60 flex flex-col bg-white shrink-0 shadow-[0_-4px_25px_-5px_rgba(0,0,0,0.1)] md:shadow-none z-10">
          
          {/* Mobile Drag Handle Visual */}
          <div className="w-full flex justify-center pt-2 pb-1 md:hidden bg-orange-50/50 border-b border-orange-100/50">
            <div className="w-12 h-1.5 rounded-full bg-zinc-200" />
          </div>

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
                    onClick={() => setSelectedIncident(isSelected ? null : incident.id)}
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

                      {/* Bottom row */}
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        <span className="text-[10px] text-zinc-500">
                          {timeAgo(incident.created_at)}
                        </span>
                        {incident.severity && (
                          <div className="ml-auto">
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${SEVERITY_COLORS[incident.severity]} border-current/20`}
                            >
                              <Activity className="w-2.5 h-2.5 mr-1" />
                              {SEVERITY_LABELS[incident.severity]}
                            </Badge>
                          </div>
                        )}
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

          {/* Resource status strip at bottom */}
          {resources.length > 0 && (
            <div className="border-t border-orange-200/60 px-4 py-3 shrink-0 bg-white">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">Resources</p>
              <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-[100px] scrollbar-hide pb-1">
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vapi Voice Channel */}
          {VAPI_ASSISTANT_ID && activeIncidents.length > 0 && (
            <div className="border-t border-zinc-800/60 px-3 py-3 shrink-0">
              <CallPanel
                assistantId={VAPI_ASSISTANT_ID}
                incidentId={activeIncidents[0]?.id || ''}
                onCallEnd={() => {
                  // Call ended — could update UI state
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
