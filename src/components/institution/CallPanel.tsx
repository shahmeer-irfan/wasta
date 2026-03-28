'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Phone, PhoneOff, Mic, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CallPanelProps {
  assistantId: string;
  incidentId: string;
  onCallEnd: () => void;
}

export default function CallPanel({ assistantId, incidentId, onCallEnd }: CallPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vapiRef = useRef<any>(null);
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startCall = useCallback(async () => {
    if (isActive || isConnecting) return;
    setIsConnecting(true);

    try {
      const { default: Vapi } = await import('@vapi-ai/web');
      const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);

      vapi.on('call-start', () => {
        setIsActive(true);
        setIsConnecting(false);
      });

      vapi.on('call-end', () => {
        setIsActive(false);
        setIsConnecting(false);
        setVolumeLevel(0);
        onCallEnd();
      });

      vapi.on('message', (msg: Record<string, unknown>) => {
        if (msg.type === 'transcript' && msg.transcriptType === 'final') {
          const text = msg.transcript as string;
          const role = msg.role as string;
          setTranscript((prev) => prev + `\n[${role}]: ${text}`);
        }
      });

      vapi.on('volume-level', (level: number) => {
        setVolumeLevel(level);
      });

      vapi.on('error', (err: unknown) => {
        console.error('Vapi call error:', err);
        setIsActive(false);
        setIsConnecting(false);
      });

      vapiRef.current = vapi;

      // Start call with context about the incident
      await vapi.start(assistantId, {
        metadata: { incident_id: incidentId, role: 'dispatcher' },
      });
    } catch (err) {
      console.error('Failed to join call:', err);
      setIsConnecting(false);
    }
  }, [isActive, isConnecting, assistantId, incidentId, onCallEnd]);

  const endCall = useCallback(() => {
    vapiRef.current?.stop();
    setIsActive(false);
    setIsConnecting(false);
  }, []);

  const toggleMute = useCallback(() => {
    if (!vapiRef.current || !isActive) return;
    const newMuted = !isMuted;
    vapiRef.current.setMuted(newMuted);
    setIsMuted(newMuted);
  }, [isMuted, isActive]);

  useEffect(() => {
    return () => { vapiRef.current?.stop(); };
  }, []);

  const bars = 5;
  const vol = Math.min(1, volumeLevel);

  return (
    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800/50 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800/30">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isActive ? '#22c55e' : isConnecting ? '#f59e0b' : '#71717a' }}
            animate={isActive || isConnecting ? { opacity: [1, 0.4, 1] } : {}}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="text-xs font-medium text-zinc-300">
            {isActive ? 'Dispatcher Line · Live' : isConnecting ? 'Connecting...' : 'Voice Channel'}
          </span>
        </div>
        {isActive && (
          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-600/30">
            CONNECTED
          </Badge>
        )}
      </div>

      {/* Volume bars */}
      {isActive && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-center gap-1.5 h-8">
            {Array.from({ length: bars }).map((_, i) => {
              const active = vol >= (i + 1) / bars * 0.5;
              return (
                <motion.div
                  key={i}
                  className="w-1.5 rounded-full"
                  style={{ backgroundColor: active ? '#22c55e' : '#27272a' }}
                  animate={{ height: active ? `${14 + vol * 14}px` : '6px' }}
                  transition={{ duration: 0.1 }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Transcript preview */}
      {transcript && (
        <div className="px-4 pb-2 max-h-24 overflow-y-auto">
          <pre className="text-[10px] text-zinc-500 whitespace-pre-wrap font-mono leading-relaxed">
            {transcript.trim()}
          </pre>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 py-3 flex items-center justify-center gap-3">
        {!isActive && !isConnecting ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={startCall}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            <Phone className="w-4 h-4" />
            Join Voice Channel
          </motion.button>
        ) : (
          <>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={toggleMute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isMuted
                  ? 'bg-amber-600/20 border border-amber-600/30 text-amber-400'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
              }`}
            >
              {isMuted ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={endCall}
              className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center text-white transition-colors"
            >
              <PhoneOff className="w-4 h-4" />
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
}
