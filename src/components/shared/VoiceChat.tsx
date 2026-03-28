'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { VoiceChannel, VoiceRole } from '@/lib/voice-channel';

interface VoiceChatProps {
  incidentId: string;
  role: VoiceRole;
  peerLabel: string;         // e.g. "Edhi Foundation" or "Civilian"
  onHangup?: () => void;
  autoConnect?: boolean;      // institution auto-connects on mount
}

export default function VoiceChat({
  incidentId,
  role,
  peerLabel,
  onHangup,
  autoConnect = false,
}: VoiceChatProps) {
  const vcRef = useRef<VoiceChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wasConnectedRef = useRef(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  // Timer for call duration
  useEffect(() => {
    if (status !== 'connected') return;
    const id = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const connect = useCallback(() => {
    if (vcRef.current || status === 'connecting') return;
    setStatus('connecting');
    wasConnectedRef.current = false;

    const vc = new VoiceChannel(incidentId, role, {
      onConnected: () => {
        console.log('[VoiceChat] Connected!');
        wasConnectedRef.current = true;
        setStatus('connected');
      },
      onDisconnected: () => {
        // Use ref instead of closure (closure captures stale status)
        if (wasConnectedRef.current) {
          console.log('[VoiceChat] Peer disconnected — ending call');
          setStatus('ended');
          onHangup?.();
        }
      },
      onRemoteStream: (stream) => {
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.autoplay = true;
        }
        audioRef.current.srcObject = stream;
      },
      onError: (err) => {
        console.error('Voice channel error:', err);
        if (wasConnectedRef.current) {
          setStatus('ended');
        }
      },
    });

    vcRef.current = vc;
    vc.start();
  }, [incidentId, role, status, onHangup]);

  const hangup = useCallback(() => {
    vcRef.current?.stop();
    vcRef.current = null;
    setStatus('ended');
    onHangup?.();
  }, [onHangup]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    vcRef.current?.setMuted(next);
  }, [isMuted]);

  // Auto-connect if prop is set
  useEffect(() => {
    if (autoConnect && status === 'idle') {
      connect();
    }
  }, [autoConnect, status, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      vcRef.current?.stop();
      vcRef.current = null;
    };
  }, []);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {status === 'idle' && (
          <motion.button
            key="start"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={connect}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-600/10 border border-emerald-600/20 hover:bg-emerald-600/20 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
              <Phone className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-zinc-800">
                Call {peerLabel}
              </div>
              <div className="text-[11px] text-zinc-500">
                Tap to start voice chat
              </div>
            </div>
          </motion.button>
        )}

        {status === 'connecting' && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20"
          >
            <motion.div
              className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <Phone className="w-4 h-4 text-amber-600" />
            </motion.div>
            <div>
              <div className="text-sm font-medium text-zinc-700">Connecting...</div>
              <div className="text-[11px] text-zinc-500">Waiting for {peerLabel}</div>
            </div>
          </motion.div>
        )}

        {status === 'connected' && (
          <motion.div
            key="connected"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl bg-emerald-600/10 border border-emerald-600/20 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-emerald-600/10">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full bg-emerald-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-xs font-semibold text-emerald-700">
                  Connected to {peerLabel}
                </span>
              </div>
              <span className="text-xs text-zinc-500 font-mono tabular-nums">
                {formatTime(duration)}
              </span>
            </div>

            {/* Controls */}
            <div className="px-4 py-3 flex items-center justify-center gap-5">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleMute}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isMuted
                    ? 'bg-amber-500/20 border border-amber-500/30 text-amber-600'
                    : 'bg-zinc-100 border border-zinc-200 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={hangup}
                className="w-13 h-13 px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center gap-2 text-white text-xs font-semibold transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                End
              </motion.button>
            </div>
          </motion.div>
        )}

        {status === 'ended' && (
          <motion.div
            key="ended"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-100 border border-zinc-200"
          >
            <PhoneOff className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs text-zinc-500">
              Call ended {duration > 0 && `(${formatTime(duration)})`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
