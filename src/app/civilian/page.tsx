'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
<<<<<<< HEAD
import { AlertTriangle, Mic, Send, X, RefreshCw, Phone, MapPin, Clock, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
=======
import { Shield, AlertTriangle, Mic, Send, X, RefreshCw, Phone, MapPin, Clock, Zap } from 'lucide-react';
>>>>>>> c95d9ab977ad9e2bb87432b1745a598991768739
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
  }, [store]);

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
    <div className="min-h-screen w-screen bg-white overflow-y-auto overflow-x-hidden relative">
      <AnimatePresence mode="wait">
        {phase === 'pre-dispatch' ? (
          <motion.div
            key="pre-dispatch"
            className="min-h-screen flex flex-col relative"
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

            {/* Main content area */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 relative z-10">

              {/* ── Map Rectangle behind SOS button ──────── */}
              <div className="relative w-full -mx-6 overflow-hidden" style={{ width: 'calc(100% + 3rem)', height: 280 }}>
                {/* Map layer */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    filter: 'blur(0.5px)',
                    opacity: 0.45,
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)',
                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)',
                  }}
                >
                  <WaastaMap
                    center={userLocation ?? undefined}
                    zoom={13}
                    markers={[]}
                    className="h-full w-full"
                  />
                </div>
                {/* SOS button centered on top */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <SOSButton
                    onPress={() => {
                      if (!isActive) {
                        // SOS pressed
                      }
                    }}
                    isActive={isActive}
                  />
                </div>
              </div>

              {/* Status / Transcript stream */}
              <div className="w-full max-w-sm">
                <TranscriptStream
                  transcript={store.transcript}
                  agentStatus={store.agentStatus}
                  landmark={store.incident?.landmark}
                />
              </div>

  {/* Error message */ }
  <AnimatePresence>
    {error && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="w-full max-w-sm flex items-start gap-2 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20"
      >
        <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
        <span className="text-sm text-orange-700">{error}</span>
        <button onClick={() => setError(null)} className="ml-auto text-zinc-500 hover:text-zinc-400">
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    )}
  </AnimatePresence>

  {/* Broadcasting indicator */ }
  <AnimatePresence>
    {store.agentStatus === 'broadcasting' && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-600/10 border border-amber-600/20"
      >
        <motion.div
          className="w-2 h-2 rounded-full bg-amber-500"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <span className="text-sm text-amber-400">Broadcasting to nearest responders...</span>
      </motion.div>
    )}
  </AnimatePresence>

              {/* Vapi AI Voice Call — show when idle */}
              {!isActive && VAPI_ASSISTANT_ID && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-sm"
                >
                  <EmergencyCall
                    assistantId={VAPI_ASSISTANT_ID}
                    onTranscript={(text, role) => {
                      if (role === 'user') store.setTranscript(text);
                    }}
                    onCallStart={() => store.setAgentStatus('listening')}
                    onCallEnd={() => {
                      if (store.agentStatus === 'listening') {
                        store.setAgentStatus('idle');
                      }
                    }}
                    onIncidentReported={(data) => {
                      // Vapi webhook handles incident creation server-side.
                      // Here we just update UI to show "analyzing" state.
                      store.setAgentStatus('analyzing');
                      store.setTranscript(
                        store.transcript || `${data.incident_type} near ${data.landmark}`
                      );
                    }}
                  />
                </motion.div>
              )}

  {/* Input options — show when idle */ }
  {
    !isActive && (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-3"
      >
        <p className="text-xs text-zinc-500 text-center tracking-wide uppercase">
          {VAPI_ASSISTANT_ID ? 'Or describe manually:' : 'Describe the emergency:'}
        </p>

        {/* ── VOICE INPUT ─────────────────────────── */}
        <div className="rounded-2xl bg-orange-50/80 border border-orange-200/50 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isRecording ? 'bg-orange-500/20 border border-orange-500/30' : 'bg-orange-100'
              }`}>
              {isRecording
                ? <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                  <Mic className="w-4 h-4 text-orange-600" />
                </motion.div>
                : <Mic className="w-4 h-4 text-zinc-600" />
              }
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-zinc-400">Voice Input</p>
              <p className="text-[10px] text-zinc-600">
                {isRecording
                  ? 'Listening... speak now'
                  : voiceTranscript
                    ? `"${voiceTranscript.slice(0, 40)}..."`
                    : 'Tap to record your emergency'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {voiceTranscript && !isRecording && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={handleVoiceSubmit}
                  disabled={!canSubmitVoice}
                  className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 flex items-center justify-center disabled:opacity-40 transition-all shadow-sm"
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                </motion.button>
              )}
              {voiceTranscript && (
                <button
                  onClick={() => { setVoiceTranscript(''); store.setTranscript(''); }}
                  className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-zinc-500 hover:text-zinc-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isRecording
                    ? 'bg-orange-500/20 text-orange-600 border border-orange-500/30 hover:bg-orange-500/30'
                    : 'bg-orange-100 text-zinc-400 hover:bg-orange-200'
                  }`}
              >
                {isRecording ? 'Stop' : 'Record'}
              </motion.button>
            </div>
          </div>

          {/* Voice transcript preview */}
          <AnimatePresence>
            {voiceTranscript && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-4 pb-3"
              >
                <div className="bg-orange-100/60 rounded-lg p-3 border border-orange-200/40">
                  <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                    {voiceTranscript}
                    {isRecording && (
                      <motion.span
                        className="inline-block w-1 h-3 bg-orange-500 ml-1 -mb-0.5"
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                      />
                    )}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-orange-100" />
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-orange-100" />
        </div>

                  {/* ── TEXT INPUT ──────────────────────────── */}
                  <div className="rounded-2xl bg-orange-50/80 border border-orange-200/50 overflow-hidden">
                    <div className="px-4 pt-3 pb-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Phone className="w-3.5 h-3.5 text-zinc-500" />
                        <p className="text-xs font-medium text-zinc-400">Type Emergency Details</p>
                      </div>
                      <textarea
                        ref={textAreaRef}
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey && canSubmitText) {
                            handleTextSubmit();
                          }
                        }}
                        placeholder="Describe what's happening, location, injuries... (Ctrl+Enter to send)"
                        rows={3}
                        className="w-full bg-transparent text-sm text-zinc-400 placeholder-zinc-600 resize-none outline-none leading-relaxed"
                      />
                    </div>
                    <div className="flex items-center justify-between px-4 pb-3">
                      <span className="text-[10px] text-zinc-600">
                        {textInput.length < 10
                          ? `${10 - textInput.length} more chars needed`
                          : `${textInput.length} chars`}
                      </span>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleTextSubmit}
                        disabled={!canSubmitText}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all shadow-sm"
                      >
                        <Send className="w-3 h-3" />
                        Send Emergency
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
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
