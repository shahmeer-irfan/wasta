'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useGuardianStore } from '@/lib/store';

interface EmergencyCallProps {
  assistantId: string;
  onTranscript: (text: string, role: 'user' | 'assistant') => void;
  onCallStart: () => void;
  onCallEnd: () => void;
  onIncidentReported: (data: { landmark: string; incident_type: string; severity: number }) => void;
}

export default function EmergencyCall({
  assistantId,
  onTranscript,
  onCallStart,
  onCallEnd,
  onIncidentReported,
}: EmergencyCallProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vapiRef = useRef<any>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const store = useGuardianStore();

  // Initialize Vapi SDK lazily (client-side only)
  const getVapi = useCallback(async () => {
    if (vapiRef.current) return vapiRef.current;

    const { default: Vapi } = await import('@vapi-ai/web');
    const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);

    // ── Event Listeners ──
    vapi.on('call-start', () => {
      setIsCallActive(true);
      setIsConnecting(false);
      onCallStart();
      store.setAgentStatus('listening');
    });

    vapi.on('call-end', () => {
      setIsCallActive(false);
      setIsConnecting(false);
      setVolumeLevel(0);
      onCallEnd();
    });

    vapi.on('message', (msg: Record<string, unknown>) => {
      // Live transcripts
      if (msg.type === 'transcript') {
        const text = msg.transcript as string;
        const role = msg.role as 'user' | 'assistant';
        if (text) {
          onTranscript(text, role);
          if (role === 'user') {
            store.setTranscript(text);
          }
        }
      }

      // Tool calls from the Vapi assistant (broker handshake)
      if (msg.type === 'function-call' || msg.type === 'tool-calls') {
        const calls = (msg.toolCalls || msg.functionCall ? [msg.functionCall] : []) as Array<Record<string, unknown>>;
        for (const call of calls) {
          if (call && (call.name === 'report_incident' || (call as Record<string, unknown>).function === 'report_incident')) {
            const args = (typeof call.arguments === 'string' ? JSON.parse(call.arguments as string) : call.arguments) as Record<string, unknown>;
            onIncidentReported({
              landmark: (args.landmark as string) || '',
              incident_type: (args.incident_type as string) || 'other',
              severity: (args.severity as number) || 3,
            });
          }
        }
      }

      // Tool-call results — extract incident_id from webhook response
      if (msg.type === 'tool-calls-result' || msg.type === 'function-call-result') {
        try {
          const results = (msg.toolCallResult || msg.results || []) as Array<Record<string, unknown>>;
          for (const r of results) {
            const parsed = typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
            if (parsed?.incident_id) {
              store.setIncidentId(parsed.incident_id);
              store.setAgentStatus('broadcasting');
            }
          }
        } catch { /* parse failed — non-critical */ }
      }
    });

    vapi.on('volume-level', (level: number) => {
      setVolumeLevel(level);
    });

    vapi.on('error', (err: unknown) => {
      console.error('Vapi error:', err);
      setIsCallActive(false);
      setIsConnecting(false);
    });

    vapiRef.current = vapi;
    return vapi;
  }, [onCallStart, onCallEnd, onTranscript, onIncidentReported, store]);

  // Start call
  const startCall = useCallback(async () => {
    if (isCallActive || isConnecting) return;
    setIsConnecting(true);

    try {
      const vapi = await getVapi();
      await vapi.start(assistantId);
    } catch (err) {
      console.error('Failed to start Vapi call:', err);
      setIsConnecting(false);
    }
  }, [isCallActive, isConnecting, getVapi, assistantId]);

  // End call
  const endCall = useCallback(async () => {
    const vapi = vapiRef.current;
    if (vapi) {
      vapi.stop();
    }
    setIsCallActive(false);
    setIsConnecting(false);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi || !isCallActive) return;
    const newMuted = !isMuted;
    vapi.setMuted(newMuted);
    setIsMuted(newMuted);
  }, [isMuted, isCallActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  // Volume visualization bars
  const bars = 5;
  const normalizedVolume = Math.min(1, volumeLevel);

  return (
    <div className="w-full max-w-sm">
      <AnimatePresence mode="wait">
        {!isCallActive && !isConnecting ? (
          // ── Start Call Button ──
          <motion.button
            key="start"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={startCall}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-red-600/10 border border-red-600/20 hover:bg-red-600/20 hover:border-red-600/30 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-600/30 flex items-center justify-center group-hover:bg-red-600/30 transition-colors">
              <Phone className="w-5 h-5 text-red-400" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-zinc-100">
                Speak to Guardian AI
              </div>
              <div className="text-xs text-zinc-500">
                Describe your emergency by voice
              </div>
            </div>
          </motion.button>
        ) : (
          // ── Active Call Panel ──
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl bg-zinc-900/90 border border-zinc-800/50 overflow-hidden"
          >
            {/* Call header */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800/30">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isConnecting ? '#f59e0b' : '#22c55e' }}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                <span className="text-xs font-medium text-zinc-300">
                  {isConnecting ? 'Connecting...' : 'Guardian AI · Live'}
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] text-red-400 border-red-600/30">
                <Mic className="w-2.5 h-2.5 mr-1" />
                CALL ACTIVE
              </Badge>
            </div>

            {/* Volume visualizer */}
            <div className="px-4 py-4">
              <div className="flex items-center justify-center gap-1.5 h-10">
                {Array.from({ length: bars }).map((_, i) => {
                  const threshold = (i + 1) / bars;
                  const active = normalizedVolume >= threshold * 0.5;
                  return (
                    <motion.div
                      key={i}
                      className="w-1.5 rounded-full"
                      style={{
                        backgroundColor: active ? '#ef4444' : '#27272a',
                      }}
                      animate={{
                        height: active ? `${20 + normalizedVolume * 20}px` : '8px',
                      }}
                      transition={{ duration: 0.1 }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Call controls */}
            <div className="px-4 pb-4 flex items-center justify-center gap-4">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleMute}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isMuted
                    ? 'bg-amber-600/20 border border-amber-600/30 text-amber-400'
                    : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isMuted ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors glow-red"
              >
                <PhoneOff className="w-5 h-5 text-white" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
