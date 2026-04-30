'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Ambulance, Flame, AlertTriangle, Car, Heart, HelpCircle,
  ChevronLeft, RefreshCw, Sun, Moon, RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import BroadcastModal from '@/components/institution/BroadcastModal';
import VoiceChat from '@/components/shared/VoiceChat';
import { useInstitutionStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { useDashboardTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import {
  Display, MonoTag, Eyebrow, StatusUnderline, SeverityBars,
} from '@/components/ui/typography';
import type { MapMarker } from '@/components/maps/WaastaMap';
import type { Incident, IncidentBroadcast, Institute, Resource, SearchTrace } from '@/types';

const WaastaMap = dynamic(() => import('@/components/maps/WaastaMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[color:var(--ink-bg)] animate-pulse" />,
});

const DEMO_INSTITUTE_ID_KEY = 'waasta_institute_id';

const INCIDENT_ICONS: Record<string, React.ReactNode> = {
  accident: <Car className="h-3.5 w-3.5" />,
  fire:     <Flame className="h-3.5 w-3.5" />,
  medical:  <Heart className="h-3.5 w-3.5" />,
  crime:    <AlertTriangle className="h-3.5 w-3.5" />,
  other:    <HelpCircle className="h-3.5 w-3.5" />,
};

const STATUS_KIND: Record<string, 'ok' | 'route' | 'alert' | 'amber' | 'action' | 'neutral'> = {
  intake: 'route',
  geocoded: 'route',
  broadcasting: 'amber',
  accepted: 'ok',
  dispatched: 'action',
  en_route: 'action',
  on_scene: 'ok',
  returning: 'route',
  resolved: 'neutral',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  intake: 'Processing',
  geocoded: 'Located',
  broadcasting: 'Alerting',
  accepted: 'Accepted',
  dispatched: 'Dispatched',
  en_route: 'En Route',
  on_scene: 'On Scene',
  returning: 'Returning',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

const ROUTE_DISPLAY_STATUSES = new Set(['dispatched', 'en_route', 'on_scene']);

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function mergeIncident(prev: Incident, patch: Partial<Incident> & { id: string }): Incident {
  const next: Incident = { ...prev, ...patch } as Incident;
  if (patch.route_waypoints == null) next.route_waypoints = prev.route_waypoints;
  return next;
}

export default function InstitutionDashboard() {
  const store = useInstitutionStore();
  const { theme, toggle: toggleTheme } = useDashboardTheme();
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [isResponding, setIsResponding] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const isInk = theme === 'ink';

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Initialize institute
  useEffect(() => {
    async function init() {
      const { data, error } = await supabase
        .from('institutes').select('*')
        .eq('is_available', true).limit(1).single();

      console.log('[DASHBOARD] Institute fetch:', data?.name || 'NONE', error?.message || '');
      if (data) {
        localStorage.setItem(DEMO_INSTITUTE_ID_KEY, data.id);
        setInstitute(data as Institute);
        setInstituteId(data.id);
      }
    }
    init();
  }, []);

  // Fetch resources + incidents
  useEffect(() => {
    if (!instituteId) return;
    async function fetchData() {
      const [resRes, incRes] = await Promise.all([
        supabase.from('resources').select('*').eq('institute_id', instituteId!),
        supabase.from('incidents').select('*')
          .not('status', 'in', '("resolved","cancelled")')
          .order('created_at', { ascending: false }).limit(20),
      ]);
      if (resRes.data) setResources(resRes.data as Resource[]);
      if (incRes.data) setAllIncidents(incRes.data as Incident[]);

      const { data: pendingBroadcasts } = await supabase
        .from('incident_broadcasts').select('*, incidents(*)')
        .eq('institute_id', instituteId!).eq('status', 'pending')
        .order('sent_at', { ascending: false }).limit(1);

      if (pendingBroadcasts?.length) {
        for (const b of pendingBroadcasts) {
          const inc = (b as Record<string, unknown>).incidents;
          if (inc) store.queueBroadcast({ ...b, incidents: inc as Incident });
        }
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instituteId]);

  // Realtime: new broadcasts
  useEffect(() => {
    if (!instituteId) return;
    const channel = supabase
      .channel(`broadcasts-${instituteId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'incident_broadcasts',
        filter: `institute_id=eq.${instituteId}`,
      }, async (payload) => {
        const broadcast = payload.new as IncidentBroadcast;
        const { data: incident } = await supabase
          .from('incidents').select('*').eq('id', broadcast.incident_id).single();
        if (incident) {
          store.queueBroadcast({ ...broadcast, incidents: incident as Incident });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instituteId]);

  // Realtime: resources
  useEffect(() => {
    if (!instituteId) return;
    const channel = supabase
      .channel(`inst-resources-${instituteId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'resources' },
        (payload) => {
          const updated = payload.new as Resource;
          setResources((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [instituteId]);

  // Realtime: incidents (with merge for TOAST)
  useEffect(() => {
    const channel = supabase
      .channel('all-incidents-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as Incident;
            setAllIncidents((prev) =>
              prev.some((i) => i.id === incoming.id) ? prev : [incoming, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const incoming = payload.new as Partial<Incident> & { id: string };
            setAllIncidents((prev) =>
              prev.map((i) => (i.id === incoming.id ? mergeIncident(i, incoming) : i)));
          } else if (payload.eventType === 'DELETE') {
            const removed = payload.old as { id: string };
            setAllIncidents((prev) => prev.filter((i) => i.id !== removed.id));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Resource updates
  useEffect(() => {
    const channel = supabase
      .channel('resource-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setResources((prev) =>
              prev.map((r) => (r.id === (payload.new as Resource).id
                ? (payload.new as Resource) : r)));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Fail-safe: any en_route / on_scene / returning incident in local state
  // that's missing route_waypoints gets re-fetched explicitly. Belt-and-braces
  // backup for realtime UPDATE payloads that arrive without the JSONB
  // (TOAST omission, transient channel hiccups, dispatch UPDATE missed during
  // a remount, etc.) — without this, the map can sit there with no
  // polyline even though the DB clearly has one. ───
  useEffect(() => {
    const needsRefetch = allIncidents.filter(
      (i) =>
        ['dispatched', 'en_route', 'on_scene', 'returning'].includes(i.status) &&
        i.assigned_resource &&
        (!i.route_waypoints || i.route_waypoints.length < 2),
    );
    if (needsRefetch.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const incident of needsRefetch) {
        const { data, error } = await supabase
          .from('incidents')
          .select('route_waypoints, route_progress_step, route_distance_km, route_duration_min, status, assigned_resource')
          .eq('id', incident.id)
          .single();
        if (cancelled || error || !data) continue;
        if (!data.route_waypoints || (data.route_waypoints as unknown[]).length < 2) continue;
        console.log(
          `[DASHBOARD] Re-fetched waypoints for ${incident.id.slice(0, 8)} ` +
          `(${(data.route_waypoints as unknown[]).length} pts, step ${data.route_progress_step})`,
        );
        setAllIncidents((prev) =>
          prev.map((i) => (i.id === incident.id ? mergeIncident(i, { id: incident.id, ...data } as Partial<Incident> & { id: string }) : i)),
        );
      }
    })();
    return () => { cancelled = true; };
  }, [allIncidents]);

  // Simulation drivers (unchanged)
  useEffect(() => {
    const enRoute = allIncidents.filter((i) => i.status === 'en_route' && i.assigned_resource);
    if (enRoute.length === 0) return;
    const intervals = enRoute.map((incident) =>
      setInterval(async () => {
        try {
          await fetch('/api/simulate/step', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incident_id: incident.id }),
          });
        } catch { /* ignore */ }
      }, 800));
    return () => intervals.forEach(clearInterval);
  }, [allIncidents]);

  useEffect(() => {
    const onScene = allIncidents.filter((i) => i.status === 'on_scene' && i.assigned_resource);
    if (onScene.length === 0) return;
    const timeouts = onScene.map((incident) =>
      setTimeout(async () => {
        await fetch('/api/simulate/return', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incident_id: incident.id }),
        });
      }, 5000));
    return () => timeouts.forEach(clearTimeout);
  }, [allIncidents]);

  useEffect(() => {
    const returning = allIncidents.filter((i) => i.status === 'returning' && i.assigned_resource);
    if (returning.length === 0) return;
    const intervals = returning.map((incident) =>
      setInterval(async () => {
        try {
          const res = await fetch('/api/simulate/return', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incident_id: incident.id }),
          });
          const data = await res.json();
          if (data.done) store.finishCall();
        } catch { /* ignore */ }
      }, 600));
    return () => intervals.forEach(clearInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIncidents]);

  const handleResponse = useCallback(async (decision: 'ACCEPT' | 'REJECT') => {
    if (!store.activeBroadcast) return;
    setIsResponding(true);
    try {
      await fetch('/api/agent/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcast_id: store.activeBroadcast.id, decision }),
      });
      if (decision === 'ACCEPT') {
        store.setBusy(true);
        store.dismissBroadcast();
      } else {
        store.finishCall();
      }
    } catch (err) {
      console.error('Response failed:', err);
    } finally {
      setIsResponding(false);
    }
  }, [store]);

  // Map markers
  const mapMarkers: MapMarker[] = [
    ...allIncidents.filter((i) => i.lat && i.lng).map((i) => ({
      lat: i.lat!, lng: i.lng!,
      iconType: 'offline' as const, iconName: 'incident' as const,
      popup: `${i.incident_type ?? 'Emergency'} · ${i.landmark ?? '—'}`,
    })),
    ...resources.map((r) => ({
      lat: r.lat, lng: r.lng,
      iconType: (r.status === 'on_scene' ? 'arrived'
        : (['dispatched', 'en_route'].includes(r.status) ? 'deployed'
        : 'active')) as 'arrived' | 'deployed' | 'active',
      iconName: 'ambulance' as const,
      popup: `${r.call_sign} · ${r.status}`,
    })),
    ...(institute ? [{
      lat: institute.lat, lng: institute.lng,
      iconType: 'institute' as const,
      iconName: institute.type === 'ambulance' ? 'hospital' as const : 'station' as const,
      popup: institute.name,
    }] : []),
  ];

  const activeIncidents = allIncidents.filter(
    (i) => !['resolved', 'cancelled'].includes(i.status));
  const availableCount = resources.filter((r) => r.status === 'available').length;
  const dispatchedCount = resources.filter((r) =>
    ['dispatched', 'en_route'].includes(r.status)).length;
  const onSceneCount = resources.filter((r) => r.status === 'on_scene').length;
  const offlineCount = activeIncidents.length;

  return (
    <div
      className={cn(
        'h-screen w-screen overflow-hidden flex flex-col',
        isInk ? 'theme-ink surface-ink' : 'surface-paper',
      )}
    >
      {/* Broadcast Modal */}
      <AnimatePresence mode="wait">
        {store.activeBroadcast && (
          <BroadcastModal
            key={`modal-${store.activeBroadcast.id}`}
            broadcast={store.activeBroadcast}
            onAccept={() => handleResponse('ACCEPT')}
            onReject={() => handleResponse('REJECT')}
            isResponding={isResponding}
          />
        )}
      </AnimatePresence>

      {/* ── TOP BAR ───────────────────────────────────────────── */}
      <header
        className={cn(
          'shrink-0 px-6 h-16 flex items-center justify-between border-b',
          isInk ? 'border-[color:var(--ink-line)]' : 'border-[color:var(--paper-line)]',
        )}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
              isInk
                ? 'border-[color:var(--ink-line)] hover:border-[color:var(--action)]'
                : 'border-[color:var(--paper-line)] hover:border-[color:var(--action)]',
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8">
              <Image src="/logoBackgroundRemoved.png" alt="" fill sizes="32px" className="object-contain" priority />
            </div>
            <div className="leading-none">
              <span
                className="font-display text-[20px] font-semibold tracking-[-0.02em]"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}
              >
                Waasta
              </span>
              <div className="mt-1 flex items-center gap-2">
                <MonoTag size="xs" className="opacity-55">
                  {institute ? `${institute.name} · ${institute.zone}` : 'Loading…'}
                </MonoTag>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <LiveDot isInk={isInk} />
          <PillCounter icon={<Ambulance className="h-3 w-3" />} value={availableCount} label="AVAIL" tone="ok" />
          <PillCounter icon={<Radio className="h-3 w-3" />}    value={dispatchedCount} label="DISP" tone="action" />
          {store.broadcastQueue.length > 0 && (
            <PillCounter
              icon={<motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--action)' }} />}
              value={store.broadcastQueue.length} label="WAITING" tone="alert"
            />
          )}
          <RecallAllButton
            isInk={isInk}
            onComplete={(payload) => {
              // Clear local UI state immediately so the operator sees the wipe.
              setAllIncidents([]);
              setSelectedIncident(null);
              store.finishCall();
              console.log('[DASHBOARD] Recall-all done:', payload);
            }}
          />
          <ThemeToggle isInk={isInk} onClick={toggleTheme} />
        </div>
      </header>

      {/* ── STATS TICKER STRIP (replaces 4-tile counters) ────── */}
      <div
        className={cn(
          'shrink-0 px-6 py-3 border-b flex items-center gap-10 overflow-x-auto',
          isInk ? 'border-[color:var(--ink-line)] bg-[color:var(--ink-bg-2)]/50'
                : 'border-[color:var(--paper-line)] bg-[color:var(--paper-bg-2)]/50',
        )}
      >
        <FidsStat n={onSceneCount}      label="ARRIVED"  color="var(--status-ok)"     />
        <FidsSep isInk={isInk} />
        <FidsStat n={dispatchedCount}   label="DEPLOYED" color="var(--action)"        />
        <FidsSep isInk={isInk} />
        <FidsStat n={availableCount}    label="ACTIVE"   color="var(--status-route)"  />
        <FidsSep isInk={isInk} />
        <FidsStat n={offlineCount}      label="OFFLINE"  color="var(--status-alert)"  />
      </div>

      {/* ── MAIN GRID ─────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-[1fr_380px] overflow-hidden">
        {/* Map */}
        <div className="relative overflow-hidden">
          {(() => {
            const routedIncident = activeIncidents.find(
              (i) => i.route_waypoints && ROUTE_DISPLAY_STATUSES.has(i.status));
            return (
              <WaastaMap
                center={institute ? { lat: institute.lat, lng: institute.lng } : undefined}
                markers={mapMarkers}
                zoom={14}
                theme={isInk ? 'ink' : 'light'}
                routeWaypoints={routedIncident?.route_waypoints ?? null}
                routeProgressStep={routedIncident?.route_progress_step ?? null}
              />
            );
          })()}

          {/* Map HUD chrome — corner ticks */}
          <span aria-hidden className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2" style={{ borderColor: 'var(--action)' }} />
          <span aria-hidden className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2" style={{ borderColor: 'var(--action)' }} />
          <span aria-hidden className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2" style={{ borderColor: 'var(--action)' }} />
          <span aria-hidden className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2" style={{ borderColor: 'var(--action)' }} />

          {/* Top-left HUD — coords */}
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--action)' }} />
            <MonoTag size="xs" className={cn(isInk ? 'text-[color:var(--ink-fg-soft)]' : 'text-[color:var(--paper-ink-soft)]')}>
              {institute
                ? `LIVE · ${institute.lat.toFixed(3)}°N ${institute.lng.toFixed(3)}°E`
                : 'LIVE · KARACHI'}
            </MonoTag>
          </div>

          {/* Bottom-left legend */}
          <MapLegend isInk={isInk} institute={institute} />
        </div>

        {/* SIDEBAR */}
        <aside
          className={cn(
            'flex flex-col border-l overflow-hidden',
            isInk ? 'border-[color:var(--ink-line)] bg-[color:var(--ink-bg-2)]/40'
                  : 'border-[color:var(--paper-line)] bg-[color:var(--paper-bg-2)]/40',
          )}
        >
          {/* Sidebar header */}
          <div className="flex shrink-0 items-baseline justify-between px-5 pt-5 pb-3">
            <Eyebrow number={1}>Active Incidents</Eyebrow>
            <span
              className="font-display font-semibold tabular-nums"
              style={{ fontSize: 22, lineHeight: 1, fontVariationSettings: '"opsz" 96' }}
            >
              {activeIncidents.length.toString().padStart(2, '0')}
            </span>
          </div>

          {/* Queue notice */}
          {store.broadcastQueue.length > 0 && (
            <div
              className={cn('mx-5 mb-3 px-3 py-2.5 border-l-2',
                isInk ? 'border-[color:var(--action)] bg-[color:var(--ink-bg-3)]'
                      : 'border-[color:var(--action)] bg-[color:var(--action)]/5')}
            >
              <div className="flex items-center gap-2">
                <motion.span animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1, repeat: Infinity }}
                  className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--action)' }} />
                <MonoTag size="xs" className="font-bold" style={{ color: 'var(--action)' }}>
                  {store.broadcastQueue.length} WAITING
                </MonoTag>
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed opacity-65">
                AI civilian ko hold pe rakh raha hai · Finish current to accept next.
              </p>
            </div>
          )}

          {/* Incident list */}
          <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3">
            <AnimatePresence initial={false}>
              {activeIncidents.map((incident, idx) => (
                <IncidentBrief
                  key={incident.id}
                  incident={incident}
                  index={idx}
                  isSelected={selectedIncident === incident.id}
                  isInk={isInk}
                  onSelect={async () => {
                    const isSelected = selectedIncident === incident.id;
                    setSelectedIncident(isSelected ? null : incident.id);
                    if (!store.activeBroadcast && ['broadcasting', 'intake', 'geocoded'].includes(incident.status)) {
                      const { data: bc } = await supabase
                        .from('incident_broadcasts').select('*')
                        .eq('incident_id', incident.id).eq('status', 'pending').limit(1).single();
                      if (bc) store.setActiveBroadcast({ ...bc, incidents: incident });
                    }
                  }}
                  onResolve={async (e) => {
                    e.stopPropagation();
                    if (incident.assigned_resource) {
                      await supabase.from('resources').update({
                        status: 'available', updated_at: new Date().toISOString(),
                      }).eq('id', incident.assigned_resource);
                    }
                    await supabase.from('incident_broadcasts').delete().eq('incident_id', incident.id);
                    await supabase.from('incidents').delete().eq('id', incident.id);
                    setAllIncidents((prev) => prev.filter((i) => i.id !== incident.id));
                    store.finishCall();
                  }}
                />
              ))}
            </AnimatePresence>

            {activeIncidents.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-14 text-center"
              >
                <span className={cn('mb-3 h-9 w-9 rounded-full border flex items-center justify-center',
                  isInk ? 'border-[color:var(--ink-line)]' : 'border-[color:var(--paper-line)]')}
                >
                  <Radio className="h-3.5 w-3.5 opacity-55" />
                </span>
                <Display level={3} className="!text-[18px] opacity-80">All Clear</Display>
                <MonoTag size="xs" className="mt-2 opacity-50">No active incidents</MonoTag>
              </motion.div>
            )}
          </div>

          {/* BOTTOM PANEL — resources + active dispatch */}
          <div className={cn('shrink-0 border-t', isInk ? 'border-[color:var(--ink-line)]' : 'border-[color:var(--paper-line)]', 'max-h-[48%] overflow-y-auto')}>
            <ResourceStrip resources={resources} isInk={isInk}
              onForceFree={async (r) => {
                if (!window.confirm(`Force ${r.call_sign} → Available? Abandons current incident.`)) return;
                await supabase.from('resources').update({
                  status: 'available', updated_at: new Date().toISOString(),
                }).eq('id', r.id);
                const incident = allIncidents.find((i) => i.assigned_resource === r.id);
                if (incident) {
                  await supabase.from('incident_broadcasts').delete().eq('incident_id', incident.id);
                  await supabase.from('incidents').delete().eq('id', incident.id);
                  setAllIncidents((prev) => prev.filter((i) => i.id !== incident.id));
                  store.finishCall();
                }
              }}
            />
            <ActiveDispatchPanel
              activeIncidents={activeIncidents}
              resources={resources}
              selectedIncident={selectedIncident}
              instituteId={instituteId}
              isInk={isInk}
              onRecall={async (incident, assignedRes) => {
                if (!window.confirm(`Recall ${assignedRes?.call_sign || 'resource'}? Incident will be deleted.`)) return;
                if (assignedRes) {
                  await supabase.from('resources').update({
                    status: 'available', updated_at: new Date().toISOString(),
                  }).eq('id', assignedRes.id);
                }
                await supabase.from('incident_broadcasts').delete().eq('incident_id', incident.id);
                await supabase.from('incidents').delete().eq('id', incident.id);
                setAllIncidents((prev) => prev.filter((i) => i.id !== incident.id));
                store.finishCall();
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

// ============================================================
// "Recall All" — wipes incidents and sends every ambulance back to its
// station. Calls /api/admin/reset which runs the supabase/reset.sql
// equivalent server-side (service role key).
// ============================================================
function RecallAllButton({
  isInk,
  onComplete,
}: {
  isInk: boolean;
  onComplete: (payload: { resources_reset: number; institutes: number; took_ms: number }) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handle = useCallback(async () => {
    if (busy) return;
    if (!window.confirm(
      'Recall ALL ambulances and clear ALL active incidents?\n' +
      'This deletes every broadcast and incident, then sends every resource ' +
      'back to its station. Cannot be undone.'
    )) return;

    setBusy(true);
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`Recall failed: ${data.error || 'Unknown error'}`);
        return;
      }
      onComplete(data);
    } catch (err) {
      alert(`Recall failed: ${err instanceof Error ? err.message : 'network error'}`);
    } finally {
      setBusy(false);
    }
  }, [busy, onComplete]);

  return (
    <button
      onClick={handle}
      disabled={busy}
      title="Wipe all incidents and recall every ambulance back to its station"
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-[10.5px] font-mono-tabular uppercase tracking-[0.08em] transition-all',
        'disabled:opacity-50 disabled:cursor-wait',
        isInk
          ? 'border-[color:var(--ink-line)] hover:border-[color:var(--action)] text-[color:var(--ink-fg-soft)] hover:text-[color:var(--action)] bg-[color:var(--ink-bg-3)]'
          : 'border-[color:var(--paper-line)] hover:border-[color:var(--action)] text-[color:var(--paper-ink-soft)] hover:text-[color:var(--action)] bg-white/60',
      )}
    >
      <RotateCcw className={cn('h-3 w-3', busy && 'animate-spin')} />
      <span className="font-bold">{busy ? 'Recalling…' : 'Recall All'}</span>
    </button>
  );
}

function ThemeToggle({ isInk, onClick }: { isInk: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={isInk ? 'Switch to paper (light)' : 'Switch to ink (dark)'}
      className={cn(
        'relative flex h-7 w-12 items-center rounded-full border transition-colors',
        isInk
          ? 'border-[color:var(--ink-line)] bg-[color:var(--ink-bg-3)]'
          : 'border-[color:var(--paper-line)] bg-[color:var(--paper-bg-2)]',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full',
          isInk ? 'ml-auto mr-0.5 bg-[color:var(--ink-fg)] text-[color:var(--ink-bg)]'
                : 'ml-0.5 mr-auto bg-[color:var(--paper-ink)] text-[color:var(--paper-bg)]',
        )}
      >
        {isInk ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
      </motion.span>
    </button>
  );
}

function LiveDot({ isInk }: { isInk: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--status-ok)' }}
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      />
      <MonoTag size="xs" className={cn('font-bold', isInk ? 'text-[color:var(--ink-fg-soft)]' : 'text-[color:var(--paper-ink-soft)]')}>
        LIVE
      </MonoTag>
    </div>
  );
}

function PillCounter({
  icon, value, label, tone,
}: {
  icon: React.ReactNode; value: number; label: string;
  tone: 'ok' | 'action' | 'alert';
}) {
  const colors = {
    ok:     { fg: 'var(--status-ok)',    bg: 'rgba(95,161,115,0.10)' },
    action: { fg: 'var(--action)',        bg: 'rgba(234,88,12,0.10)' },
    alert:  { fg: 'var(--status-alert)',  bg: 'rgba(193,57,43,0.10)' },
  }[tone];
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-sm border"
      style={{ borderColor: colors.fg + '40', background: colors.bg, color: colors.fg }}
    >
      <span>{icon}</span>
      <span className="font-mono-tabular text-[11px] font-bold tabular-nums">{value}</span>
      <MonoTag size="xs" className="opacity-75">{label}</MonoTag>
    </div>
  );
}

function FidsStat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="flex shrink-0 items-baseline gap-2.5">
      <span
        className="font-display font-semibold leading-none tabular-nums"
        style={{ fontSize: 28, color, letterSpacing: '-0.025em', fontVariationSettings: '"opsz" 96, "SOFT" 30' }}
      >
        {n.toString().padStart(2, '0')}
      </span>
      <MonoTag size="xs" className="opacity-65">{label}</MonoTag>
    </div>
  );
}

function FidsSep({ isInk }: { isInk: boolean }) {
  return (
    <span
      aria-hidden
      className="h-7 w-px shrink-0"
      style={{ background: isInk ? 'var(--ink-line)' : 'var(--paper-line)' }}
    />
  );
}

function MapLegend({ isInk, institute }: { isInk: boolean; institute: Institute | null }) {
  const items = [
    { color: 'var(--status-ok)',      label: 'Arrived'  },
    { color: 'var(--action)',          label: 'Deployed' },
    { color: 'var(--status-route)',    label: 'Active'   },
    { color: 'var(--status-alert)',    label: 'Incident', ping: true },
    { color: isInk ? 'var(--ink-fg)' : 'var(--paper-ink)', label: institute?.type === 'ambulance' ? 'Hospital' : 'Station' },
  ];
  return (
    <div
      className={cn(
        'absolute bottom-4 left-4 z-[5] flex flex-col gap-2 px-3 py-3 backdrop-blur-sm border',
        isInk
          ? 'bg-[color:var(--ink-bg-2)]/85 border-[color:var(--ink-line)]'
          : 'bg-white/85 border-[color:var(--paper-line)]',
      )}
    >
      <MonoTag size="xs" className="opacity-50 mb-1">Legend</MonoTag>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2.5">
          <span className="relative flex h-3.5 w-3.5 items-center justify-center">
            {it.ping && (
              <span className="absolute h-3 w-3 rounded-full opacity-30 animate-ping" style={{ background: it.color }} />
            )}
            <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
          </span>
          <MonoTag size="xs" className="opacity-75">{it.label}</MonoTag>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Editorial incident brief
// ============================================================
function IncidentBrief({
  incident, index, isSelected, isInk, onSelect, onResolve,
}: {
  incident: Incident; index: number; isSelected: boolean; isInk: boolean;
  onSelect: () => void; onResolve: (e: React.MouseEvent) => void | Promise<void>;
}) {
  const kind = STATUS_KIND[incident.status] ?? 'neutral';
  const label = STATUS_LABEL[incident.status] ?? 'Unknown';
  const isCritical = (incident.severity ?? 0) >= 5;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: 16, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -12, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onClick={onSelect}
      className={cn(
        'group cursor-pointer relative px-3.5 py-3 border transition-colors',
        isSelected
          ? 'border-[color:var(--action)]'
          : (isInk ? 'border-[color:var(--ink-line)] hover:border-[color:var(--ink-fg-muted)]'
                   : 'border-[color:var(--paper-line)] hover:border-[color:var(--paper-ink-muted)]'),
        isInk ? 'bg-[color:var(--ink-bg-2)]' : 'bg-white/70',
      )}
    >
      {/* Selected glow */}
      {isSelected && (
        <span aria-hidden className="pointer-events-none absolute -inset-px"
          style={{ boxShadow: '0 0 0 1px var(--action), 0 14px 36px -18px rgba(234,88,12,0.55)' }} />
      )}
      {isCritical && (
        <span aria-hidden className="absolute right-0 top-0 bottom-0 w-[3px] animate-heartbeat" style={{ background: 'var(--sev-life)' }} />
      )}

      <div className="flex items-start justify-between gap-3">
        {/* Left: number + headline */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <MonoTag size="xs" className="opacity-45 tabular-nums">№ {String(index + 1).padStart(2, '0')}</MonoTag>
            <span className={cn('h-px flex-1', isInk ? 'bg-[color:var(--ink-line)]' : 'bg-[color:var(--paper-line)]')} />
            <MonoTag size="xs" className="opacity-50">{timeAgo(incident.created_at)}</MonoTag>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-65">{INCIDENT_ICONS[incident.incident_type ?? 'other'] ?? <HelpCircle className="h-3.5 w-3.5" />}</span>
            <Display level={3} className="!text-[19px] capitalize">
              {incident.incident_type
                ? incident.incident_type.replace('_', ' ')
                : incident.status === 'intake' ? 'Processing…' : 'Unknown'}
            </Display>
          </div>
          {incident.landmark ? (
            <p className={cn('mt-1.5 text-[12.5px] leading-snug truncate',
              isInk ? 'text-[color:var(--ink-fg-soft)]' : 'text-[color:var(--paper-ink-soft)]')}>
              {incident.landmark}{incident.zone ? ` · ${incident.zone}` : ''}
            </p>
          ) : (
            <p className={cn('mt-1.5 text-[12.5px] italic leading-snug',
              isInk ? 'text-[color:var(--ink-fg-muted)]' : 'text-[color:var(--paper-ink-muted)]')}>
              Locating…
            </p>
          )}

          {/* Expanded summary */}
          <AnimatePresence>
            {isSelected && incident.summary && (
              <motion.p
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: 'auto', opacity: 1, marginTop: 10 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                className="overflow-hidden font-display italic text-[13px] leading-relaxed"
                style={{ fontVariationSettings: '"opsz" 60, "SOFT" 100' }}
              >
                &ldquo;{incident.summary}&rdquo;
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Right: severity + status */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {incident.severity != null && (
            <SeverityBars severity={incident.severity} className={cn(isInk ? 'text-[color:var(--ink-fg-muted)]' : 'text-[color:var(--paper-ink-muted)]')} />
          )}
          <StatusUnderline kind={kind}>{label}</StatusUnderline>
          <button
            onClick={onResolve}
            title="Mark as resolved"
            className={cn('mt-1 text-[10px] opacity-40 hover:opacity-100 transition-opacity', isInk ? 'hover:text-[color:var(--status-alert)]' : 'hover:text-[color:var(--status-alert)]')}
          >
            ✕
          </button>
        </div>
      </div>
    </motion.article>
  );
}

// ============================================================
// Resource chits
// ============================================================
function ResourceStrip({
  resources, isInk, onForceFree,
}: {
  resources: Resource[]; isInk: boolean;
  onForceFree: (r: Resource) => void | Promise<void>;
}) {
  if (resources.length === 0) return null;

  const dotColor = (status: string) => ({
    available: 'var(--status-ok)',
    dispatched: 'var(--action)',
    en_route: 'var(--action)',
    on_scene: 'var(--status-route)',
    returning: 'var(--status-route)',
  }[status] ?? 'var(--ink-fg-muted)');

  return (
    <div className={cn('px-5 py-3 border-b', isInk ? 'border-[color:var(--ink-line)]' : 'border-[color:var(--paper-line)]')}>
      <Eyebrow className="mb-2.5 opacity-65">Resources</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {resources.map((r) => (
          <button
            key={r.id}
            onClick={() => r.status !== 'available' && onForceFree(r)}
            className={cn(
              'group flex items-center gap-2 px-2.5 py-1 border text-current transition-all',
              r.status !== 'available' && 'cursor-pointer hover:opacity-80',
              isInk ? 'border-[color:var(--ink-line)] bg-[color:var(--ink-bg-3)]/60' : 'border-[color:var(--paper-line)] bg-white/60',
            )}
            title={r.status !== 'available' ? `Click to free ${r.call_sign}` : undefined}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor(r.status) }} />
            <MonoTag size="sm" className="font-bold">{r.call_sign}</MonoTag>
            <MonoTag size="xs" className="opacity-50">
              {r.status === 'on_scene' ? 'arrived' : r.status.replace('_', ' ')}
            </MonoTag>
            {r.status !== 'available' && (
              <RefreshCw className="h-3 w-3 opacity-30 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Active dispatch — voice chat + dispatch button
// ============================================================
function ActiveDispatchPanel({
  activeIncidents, resources, selectedIncident, instituteId, isInk, onRecall,
}: {
  activeIncidents: Incident[]; resources: Resource[];
  selectedIncident: string | null; instituteId: string | null; isInk: boolean;
  onRecall: (incident: Incident, assignedRes: Resource | undefined) => void | Promise<void>;
}) {
  const dispatchablePool = ['accepted', 'dispatched', 'en_route', 'on_scene'];
  const selectedInc = selectedIncident
    ? activeIncidents.find((i) => i.id === selectedIncident) : null;
  const dispatchable =
    (selectedInc && dispatchablePool.includes(selectedInc.status))
      ? selectedInc
      : activeIncidents.find((i) => dispatchablePool.includes(i.status));

  const dispatchClickRef = useRef(false);
  if (!dispatchable) return null;

  const isDispatched = ['dispatched', 'en_route', 'on_scene'].includes(dispatchable.status);
  const assignedRes = dispatchable.assigned_resource
    ? resources.find((r) => r.id === dispatchable.assigned_resource) : undefined;

  return (
    <div className="px-5 py-4 space-y-3.5">
      <div className="flex items-baseline justify-between">
        <Eyebrow className="font-bold" >
          {dispatchable.status === 'on_scene'
            ? 'On Scene'
            : isDispatched ? 'Ambulance En Route' : 'Dispatch Now'}
        </Eyebrow>
        {isDispatched && assignedRes && (
          <MonoTag size="sm" className="font-bold" style={{ color: 'var(--action)' }}>
            {assignedRes.call_sign}
          </MonoTag>
        )}
      </div>

      <div>
        <Display level={3} className="!text-[18px] capitalize">
          {dispatchable.incident_type ?? 'Emergency'}
        </Display>
        <p className={cn('mt-0.5 text-[12px]', isInk ? 'text-[color:var(--ink-fg-soft)]' : 'text-[color:var(--paper-ink-soft)]')}>
          {dispatchable.landmark ?? '—'}{dispatchable.zone ? ` · ${dispatchable.zone}` : ''}
        </p>
      </div>

      {/* A* search trace — shows the broker algorithm's decision */}
      {dispatchable.search_trace && (
        <SearchTraceBadge trace={dispatchable.search_trace} isInk={isInk} />
      )}

      {/* Voice chat — keeps existing component */}
      <VoiceChat
        key={`voice-${dispatchable.id}`}
        incidentId={dispatchable.id}
        role="institution"
        peerLabel="Civilian"
        autoConnect
      />

      {!isDispatched ? (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={async (e) => {
            e.stopPropagation();
            if (dispatchClickRef.current) return;
            dispatchClickRef.current = true;
            const incId = dispatchable.id;
            const instId = instituteId;
            if (!incId || !instId) {
              alert('Missing incident or institute ID');
              dispatchClickRef.current = false;
              return;
            }
            try {
              const res = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ incident_id: incId, institute_id: instId }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(`Dispatch failed: ${data.error || 'Unknown error'}`);
              }
            } finally {
              dispatchClickRef.current = false;
            }
          }}
          className="flex w-full items-center justify-center gap-2 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all"
          style={{ background: 'var(--action)' }}
        >
          <Ambulance className="h-4 w-4" />
          DISPATCH AMBULANCE
        </motion.button>
      ) : (
        <div className="space-y-2">
          <div
            className={cn(
              'flex items-center justify-center gap-2 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] border',
              isInk ? 'border-[color:var(--ink-line)] bg-[color:var(--ink-bg-3)]' : 'border-[color:var(--paper-line)] bg-[color:var(--paper-bg-2)]',
            )}
            style={{ color: 'var(--status-ok)' }}
          >
            <Ambulance className="h-4 w-4" />
            {assignedRes?.call_sign || 'AMBULANCE'} DISPATCHED
            {dispatchable.status === 'en_route' && (
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--status-ok)' }} />
            )}
          </div>
          <button
            onClick={() => onRecall(dispatchable, assignedRes)}
            className={cn(
              'flex w-full items-center justify-center gap-2 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] border transition-colors',
              isInk
                ? 'border-[color:var(--ink-line)] hover:border-[color:var(--action)] text-[color:var(--ink-fg-soft)]'
                : 'border-[color:var(--paper-line)] hover:border-[color:var(--action)] text-[color:var(--paper-ink-soft)]',
            )}
          >
            <RefreshCw className="h-3 w-3" />
            Recall &amp; free resource
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// A* search trace badge — shows the broker algorithm's reasoning.
// Collapsed by default (hops, cost, expansion stats); click to
// expand the full path of landmarks the search walked through.
// ============================================================
function SearchTraceBadge({ trace, isInk }: { trace: SearchTrace; isInk: boolean }) {
  const [open, setOpen] = useState(false);
  const isAStar = trace.algorithm === 'A*';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'border text-[11px] leading-snug',
        isInk ? 'border-[color:var(--ink-line)] bg-[color:var(--ink-bg-3)]/60'
              : 'border-[color:var(--paper-line)] bg-[color:var(--paper-bg-2)]/70',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full font-mono-tabular text-[9px] font-bold"
          style={{ background: isAStar ? 'var(--action)' : 'var(--status-route)', color: 'white' }}
          title={isAStar ? 'A* informed search' : 'Haversine fallback'}
        >
          {isAStar ? '★' : 'H'}
        </span>

        <MonoTag size="xs" className="font-bold">
          {isAStar ? 'A*' : 'HAVERSINE'}
        </MonoTag>

        {isAStar && trace.hops != null && (
          <>
            <span className="opacity-30">·</span>
            <MonoTag size="xs">
              <span className="tabular-nums">{trace.hops}</span> HOPS
            </MonoTag>
          </>
        )}

        <span className="opacity-30">·</span>
        <MonoTag size="xs">
          <span className="tabular-nums">{trace.cost_km.toFixed(2)}</span> KM
        </MonoTag>

        {isAStar && trace.expanded_nodes && trace.total_nodes && (
          <>
            <span className="opacity-30">·</span>
            <MonoTag size="xs" className="opacity-65">
              EXP <span className="tabular-nums">{trace.expanded_nodes.length}</span>
              /{trace.total_nodes}
            </MonoTag>
          </>
        )}

        {isAStar && trace.took_ms != null && (
          <MonoTag size="xs" className="ml-auto opacity-50">
            {trace.took_ms}ms
          </MonoTag>
        )}
      </button>

      <AnimatePresence>
        {open && trace.path && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className={cn('px-3 pb-2.5 pt-0', isInk ? 'border-t border-[color:var(--ink-line)]' : 'border-t border-[color:var(--paper-line)]')}>
              <MonoTag size="xs" className="opacity-50">CHOSEN PATH</MonoTag>
              <ol className="mt-1.5 space-y-1">
                {trace.path.map((node, i) => (
                  <li key={node.id} className="flex items-baseline gap-2">
                    <MonoTag size="xs" className="opacity-40 tabular-nums">
                      {String(i).padStart(2, '0')}
                    </MonoTag>
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: node.kind === 'incident' ? 'var(--status-alert)'
                          : node.kind === 'institute' ? 'var(--action)'
                          : 'var(--status-route)',
                      }}
                    />
                    <span className="text-[11.5px] capitalize">{node.label}</span>
                    <MonoTag size="xs" className="ml-auto opacity-40">
                      {node.kind}
                    </MonoTag>
                  </li>
                ))}
              </ol>
              {trace.heuristic && (
                <MonoTag size="xs" className="mt-2 block opacity-40">
                  h = {trace.heuristic}
                </MonoTag>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
