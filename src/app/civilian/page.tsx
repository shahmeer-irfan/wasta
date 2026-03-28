'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { AlertTriangle, Mic, Send, X, RefreshCw, MapPin, Clock, ChevronLeft, Zap } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import SOSButton from '@/components/civilian/SOSButton';
import TranscriptStream from '@/components/civilian/TranscriptStream';
import TrackingSheet from '@/components/civilian/TrackingSheet';
import EmergencyCall from '@/components/civilian/EmergencyCall';
import VoiceChat from '@/components/shared/VoiceChat';
import { useWaastaStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import type { Incident, Resource, Institute } from '@/types';

const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || '';

const WaastaMap = dynamic(() => import('@/components/maps/WaastaMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-orange-50 animate-pulse" />,
});


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionAny = any;

export default function CivilianPage() {
  const store = useWaastaStore();
  const [phase, setPhase] = useState<'pre-dispatch' | 'tracking'>('pre-dispatch');
  const [institute, setInstitute] = useState<Institute | null>(null);
  const [resourcePosition, setResourcePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [endVapiCall, setEndVapiCall] = useState(false);
  const [triggerVapiCall, setTriggerVapiCall] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<SpeechRecognitionAny>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // ── Geolocation ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {/* silently fall back to Karachi center */ },
      { timeout: 8000 }
    );
  }, []);

  // ── Voice Recognition Setup ──────────────────────────────
  const startVoiceRecording = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input not supported in this browser. Please use text input.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const combined = (final + interim).trim();
      setVoiceTranscript(combined);
      store.setTranscript(combined);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone permissions or use text input.');
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    // Don't set agentStatus here — that hides the panel.
    // agentStatus='listening' is only set by VAPI.
  }, [store]);

  const stopVoiceRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  // ── Submit Emergency ──────────────────────────────────────
  const handleSubmitEmergency = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    setError(null);

    // Stop recording if active
    recognitionRef.current?.stop();
    setIsRecording(false);

    store.setTranscript(transcript);
    store.setAgentStatus('analyzing');

    try {
      const res = await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          lat: userLocation?.lat || null,
          lng: userLocation?.lng || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();

      if (data.incident_id) {
        store.setIncidentId(data.incident_id);
        store.setBroadcastId(data.broadcast_id || null);
        store.setAgentStatus('broadcasting');
      } else {
        throw new Error('No incident ID returned');
      }
    } catch (err) {
      console.error('Agent trigger failed:', err);
      setError(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`);
      store.setAgentStatus('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, userLocation?.lat, userLocation?.lng]);

  // ── Handle Voice Submit ───────────────────────────────────
  const handleVoiceSubmit = useCallback(() => {
    if (voiceTranscript.trim()) {
      handleSubmitEmergency(voiceTranscript);
    }
  }, [voiceTranscript, handleSubmitEmergency]);

  // ── Handle Text Submit ────────────────────────────────────
  const handleTextSubmit = useCallback(() => {
    if (textInput.trim()) {
      handleSubmitEmergency(textInput);
    }
  }, [textInput, handleSubmitEmergency]);

  // ── Reset ─────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setTextInput('');
    setVoiceTranscript('');
    setError(null);
    store.reset();
  }, [store]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  // ── Background poller: find incident while Vapi call is active ──
  useEffect(() => {
    // Only poll when call is active but we don't have an incident yet
    if (store.incidentId || store.agentStatus === 'idle') return;

    console.log('[CIVILIAN] Starting background incident poller');
    const interval = setInterval(async () => {
      if (store.incidentId) { clearInterval(interval); return; }

      const { data: recent } = await supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (recent) {
        const age = Date.now() - new Date(recent.created_at).getTime();
        if (age < 180000) { // Created within last 3 min
          console.log('[CIVILIAN] Poller found incident:', recent.id.substring(0, 8), 'status:', recent.status);
          store.setIncidentId(recent.id);
          store.setIncident(recent as Incident);

          if (recent.status === 'broadcasting' || recent.status === 'geocoded') {
            store.setAgentStatus('broadcasting');
          }
          if (recent.status === 'accepted') {
            store.setAgentStatus('accepted');
            setEndVapiCall(true);
            setPhase('tracking');
            if (recent.accepted_by) {
              const { data: inst } = await supabase.from('institutes').select('*').eq('id', recent.accepted_by).single();
              if (inst) setInstitute(inst as Institute);
            }
          }
          clearInterval(interval);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.agentStatus, store.incidentId]);

  // ── Subscribe to incident changes ─────────────────────────
  useEffect(() => {
    if (!store.incidentId) return;

    const channel = supabase
      .channel(`incident-${store.incidentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'incidents',
          filter: `id=eq.${store.incidentId}`,
        },
        async (payload) => {
          const updated = payload.new as Incident;
          console.log('[CIVILIAN] Incident update:', updated.id.substring(0,8), '→', updated.status);
          store.setIncident(updated);

          // ACCEPTED → end AI call, switch to tracking, start voice with institution
          if (updated.status === 'accepted' && phase !== 'tracking') {
            console.log('[CIVILIAN] ★ ACCEPTED! Switching to tracking + voice chat');
            store.setAgentStatus('accepted');
            setEndVapiCall(true);
            setPhase('tracking');

            if (updated.accepted_by) {
              const { data: inst } = await supabase
                .from('institutes')
                .select('*')
                .eq('id', updated.accepted_by)
                .single();
              if (inst) setInstitute(inst as Institute);
            }
          }

          // DISPATCHED → show ambulance on map
          if (updated.status === 'dispatched' || updated.status === 'en_route' || updated.status === 'on_scene') {
            if (updated.assigned_resource) {
              const { data: res } = await supabase
                .from('resources')
                .select('*')
                .eq('id', updated.assigned_resource)
                .single();
              if (res) {
                store.setAssignedResource(res as Resource);
                store.setAgentStatus('dispatched');
              }
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.incidentId]);

  // ── Subscribe to resource movement ────────────────────────
  useEffect(() => {
    if (!store.assignedResource?.id) return;

    const channel = supabase
      .channel(`resource-${store.assignedResource.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'resources',
          filter: `id=eq.${store.assignedResource.id}`,
        },
        (payload) => {
          const updated = payload.new as Resource;
          setResourcePosition({ lat: updated.lat, lng: updated.lng });
          store.setAssignedResource(updated);

          if (store.incident?.lat && store.incident?.lng) {
            const dist = haversineKm(
              updated.lat, updated.lng,
              store.incident.lat, store.incident.lng
            );
            store.setEta(Math.max(30, Math.round((dist / 30) * 3600)));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.assignedResource?.id]);

  // ── Map Markers ───────────────────────────────────────────
  const mapMarkers: Array<{ lat: number; lng: number; iconType?: 'incident' | 'ambulance' | 'institute'; popup?: string }> = [];
  if (store.incident?.lat && store.incident?.lng) {
    mapMarkers.push({
      lat: store.incident.lat,
      lng: store.incident.lng,
      iconType: 'incident',
      popup: `📍 ${store.incident.landmark || 'Incident'}`,
    });
  }
  if (resourcePosition) {
    mapMarkers.push({
      lat: resourcePosition.lat,
      lng: resourcePosition.lng,
      iconType: 'ambulance',
      popup: `🚑 ${store.assignedResource?.call_sign || 'Ambulance'}`,
    });
  }

  // isActive = VAPI or agent pipeline is running (hides input panel)
  // isRecording = browser speech API is recording (does NOT hide input panel)
  const isActive = store.agentStatus !== 'idle' && !isRecording;
  const canSubmitText = textInput.trim().length > 10;
  const canSubmitVoice = voiceTranscript.trim().length > 5;

  return (
    <div className="h-screen w-screen bg-white overflow-x-hidden relative" style={{ overflowY: phase === 'pre-dispatch' ? 'auto' : 'hidden' }}>
      <AnimatePresence mode="wait">
        {phase === 'pre-dispatch' ? (
          <motion.div
            key="pre-dispatch"
            className="h-full flex flex-col relative overflow-y-auto"
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
          >

            {/* Header — sticky */}
            <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Link href="/">
                  <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center hover:bg-orange-100 transition-colors cursor-pointer shrink-0">
                    <ChevronLeft className="w-5 h-5 text-orange-600" />
                  </div>
                </Link>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Image src="/logo.png" alt="Waasta" width={24} height={24} className="rounded-md" />
                    <span className="text-lg font-black text-zinc-900 tracking-tight">
                      WAASTA
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 ml-7">Emergency Response · Karachi</p>
                </div>
              </div>

              {/* Reset button when active */}
              <AnimatePresence>
                {isActive && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={handleReset}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 border border-orange-200 text-zinc-600 hover:text-zinc-400 hover:bg-orange-200 transition-colors text-xs"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* ── Main: Clean minimal layout ──────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">

              {/* Map background */}
              <div className="absolute inset-0 pointer-events-none" style={{
                opacity: 0.3,
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
                maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
              }}>
                <WaastaMap
                  center={userLocation ?? undefined}
                  zoom={14}
                  markers={userLocation ? [{ lat: userLocation.lat, lng: userLocation.lng, iconType: 'institute' as const }] : []}
                  className="h-full w-full"
                />
              </div>

              {/* SOS Button — main action */}
              <div className="relative z-10 flex flex-col items-center">
                <SOSButton
                  onPress={() => {
                    if (!isActive && VAPI_ASSISTANT_ID) {
                      setTriggerVapiCall(true);
                    }
                  }}
                  isActive={store.agentStatus !== 'idle'}
                />
                <p className="text-xs text-gray-400 mt-4">
                  {store.agentStatus === 'idle' ? 'Tap to call Waasta AI' : ''}
                </p>
              </div>

              {/* Status / Transcript — shows when active */}
              {isActive && (
                <div className="w-full max-w-sm mt-4 relative z-10">
                  <TranscriptStream
                    transcript={store.transcript}
                    agentStatus={store.agentStatus}
                    landmark={store.incident?.landmark}
                  />
                </div>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="w-full max-w-sm mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 relative z-10"
                  >
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-xs text-red-700 flex-1">{error}</span>
                    <button onClick={() => setError(null)}><X className="w-3.5 h-3.5 text-gray-400" /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Broadcasting */}
              <AnimatePresence>
                {store.agentStatus === 'broadcasting' && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 mt-3 relative z-10"
                  >
                    <motion.div className="w-2 h-2 rounded-full bg-amber-500" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                    <span className="text-xs text-amber-700 font-medium">Broadcasting to responders...</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Vapi EmergencyCall — hidden but always mounted */}
              {VAPI_ASSISTANT_ID && (
                <div className="w-full max-w-sm mt-3 relative z-10">
                  <EmergencyCall
                    assistantId={VAPI_ASSISTANT_ID}
                    forceEnd={endVapiCall}
                    autoStart={triggerVapiCall}
                    onTranscript={(text, role) => {
                      if (role === 'user') store.setTranscript(text);
                      if (role === 'assistant') store.setTranscript(text);
                    }}
                    onCallStart={() => store.setAgentStatus('listening')}
                    onCallEnd={async () => {
                      if (!store.incidentId) {
                        store.setAgentStatus('analyzing');
                        for (let i = 0; i < 5; i++) {
                          await new Promise((r) => setTimeout(r, 1000));
                          const { data: recent } = await supabase
                            .from('incidents').select('*')
                            .order('created_at', { ascending: false }).limit(1).single();
                          if (recent) {
                            const age = Date.now() - new Date(recent.created_at).getTime();
                            if (age < 120000) {
                              store.setIncidentId(recent.id);
                              store.setIncident(recent as Incident);
                              store.setAgentStatus(recent.status === 'accepted' ? 'accepted' : 'broadcasting');
                              if (recent.status === 'accepted') {
                                setEndVapiCall(true);
                                setPhase('tracking');
                                if (recent.accepted_by) {
                                  const { data: inst } = await supabase.from('institutes').select('*').eq('id', recent.accepted_by).single();
                                  if (inst) setInstitute(inst as Institute);
                                }
                              }
                              break;
                            }
                          }
                        }
                        if (!store.incidentId) store.setAgentStatus('idle');
                      }
                    }}
                    onIncidentReported={async (data) => {
                      store.setAgentStatus('analyzing');
                      store.setTranscript(`${data.incident_type} near ${data.landmark}`);
                      for (let attempt = 0; attempt < 8; attempt++) {
                        await new Promise((r) => setTimeout(r, 1500));
                        const { data: recent } = await supabase
                          .from('incidents').select('*')
                          .order('created_at', { ascending: false }).limit(1).single();
                        if (recent && !store.incidentId) {
                          store.setIncidentId(recent.id);
                          store.setIncident(recent as Incident);
                          store.setAgentStatus('broadcasting');
                          break;
                        }
                      }
                    }}
                  />
                </div>
              )}

              {/* Two small buttons: Voice Record + Text Input */}
              {!isActive && (
                <div className="flex items-center gap-3 mt-6 relative z-10">
                  {/* Voice record button */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold transition-all ${
                      isRecording
                        ? 'bg-red-500 text-white shadow-lg'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600 shadow-sm'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    {isRecording ? 'Stop Recording' : 'Voice'}
                  </motion.button>

                  {/* Text input button — opens textarea */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => textAreaRef.current?.focus()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600 text-xs font-semibold shadow-sm transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Text
                  </motion.button>
                </div>
              )}

              {/* Voice transcript preview */}
              <AnimatePresence>
                {voiceTranscript && !isActive && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="w-full max-w-sm mt-3 relative z-10"
                  >
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
                      <p className="text-xs text-green-800 flex-1 leading-relaxed">&ldquo;{voiceTranscript}&rdquo;</p>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={handleVoiceSubmit} disabled={!canSubmitVoice}
                          className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center disabled:opacity-40">
                          <Send className="w-3 h-3 text-white" />
                        </button>
                        <button onClick={() => { setVoiceTranscript(''); store.setTranscript(''); }}
                          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                          <X className="w-3 h-3 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Text input — compact, shows below buttons */}
              {!isActive && (
                <div className="w-full max-w-sm mt-3 relative z-10">
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <textarea
                      ref={textAreaRef}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey && canSubmitText) handleTextSubmit(); }}
                      placeholder="Kya hua, kahan hua... (Ctrl+Enter to send)"
                      rows={2}
                      className="w-full px-4 pt-3 pb-1 text-sm text-gray-800 placeholder-gray-400 resize-none outline-none bg-transparent"
                    />
                    <div className="flex items-center justify-between px-4 pb-2.5">
                      <span className="text-[10px] text-gray-400">
                        {textInput.length < 10 ? `${10 - textInput.length} more` : `${textInput.length} chars`}
                      </span>
                      <motion.button whileTap={{ scale: 0.95 }} onClick={handleTextSubmit} disabled={!canSubmitText}
                        className="px-3.5 py-1 rounded-full bg-orange-500 text-white text-[11px] font-bold disabled:opacity-30 transition-opacity"
                      >
                        Send
                      </motion.button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-zinc-700 text-xs">
                <AlertTriangle className="w-3 h-3" />
                <span>For genuine emergencies only</span>
              </div>
              {/* Demo trigger — one-click simulation */}
              {!isActive && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    store.setAgentStatus('analyzing');
                    store.setTranscript('Running demo simulation...');
                    try {
                      const res = await fetch('/api/demo/trigger', { method: 'POST' });
                      const data = await res.json();
                      if (data.incident_id) {
                        store.setIncidentId(data.incident_id);
                        store.setBroadcastId(data.broadcast_id || null);
                        store.setTranscript(data.transcript || '');
                        store.setAgentStatus('broadcasting');
                      }
                    } catch {
                      store.setAgentStatus('idle');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-600/10 border border-amber-600/20 text-amber-400 hover:bg-amber-600/20 transition-colors text-xs"
                >
                  <Zap className="w-3 h-3" />
                  Demo
                </motion.button>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="tracking"
            className="h-full flex flex-col"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Full-screen map */}
            <div className="flex-1 relative">
              <WaastaMap
                markers={mapMarkers}
                flyTo={store.incident?.lat && store.incident?.lng ? {
                  lat: store.incident.lat,
                  lng: store.incident.lng,
                } : null}
                zoom={14}
              />

        {/* Top overlay */}
        <div className="absolute top-0 left-0 right-0 p-4 pt-10 z-[1000]">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Waasta" width={20} height={20} className="rounded" />
            <span className="text-sm font-semibold text-zinc-900">WAASTA</span>
            <motion.div
              className="ml-auto px-3 py-1 rounded-full bg-emerald-600/20 border border-emerald-600/30"
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-[11px] text-emerald-400 font-semibold">HELP EN ROUTE</span>
            </motion.div>
          </div>

                {/* Quick info chips */}
                {store.incident && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {store.incident.landmark && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50/80 border border-orange-200/50 backdrop-blur-sm">
                        <MapPin className="w-3 h-3 text-orange-600" />
                        <span className="text-xs text-zinc-400">{store.incident.landmark}</span>
                      </div>
                    )}
                    {store.eta && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50/80 border border-orange-200/50 backdrop-blur-sm">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span className="text-xs text-zinc-400">
                          ~{Math.ceil(store.eta / 60)} min ETA
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

      {/* Bottom tracking sheet */}
      {store.incident && (
        <TrackingSheet
          incident={store.incident}
          resource={store.assignedResource}
          eta={store.eta}
          instituteName={institute?.name}
        />
      )}
    </motion.div>
  )
}
      </AnimatePresence >
    </div >
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
