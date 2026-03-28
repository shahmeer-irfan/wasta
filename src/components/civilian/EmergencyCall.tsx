'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWaastaStore } from '@/lib/store';

interface EmergencyCallProps {
  agentId?: string; // Not used anymore but kept for compat
  onTranscript: (text: string, role: 'user' | 'assistant') => void;
  onCallStart: () => void;
  onCallEnd: () => void;
  onIncidentReported: (data: { landmark: string; incident_type: string; severity: number }) => void;
  forceEnd?: boolean;
  autoStart?: boolean;
}

export default function EmergencyCall({
  onTranscript,
  onCallStart,
  onCallEnd,
  onIncidentReported,
  forceEnd = false,
  autoStart = false,
}: EmergencyCallProps) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const store = useWaastaStore();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string>(`session-${Date.now()}`);
  const chunksRef = useRef<Blob[]>([]);
  const isProcessingRef = useRef(false);
  const turnCountRef = useRef(0);

  // Speak text using browser Speech Synthesis (FREE, works in Urdu)
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!text || isMuted) { resolve(); return; }

      setIsSpeaking(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ur-PK'; // Urdu
      utterance.rate = 1.1;
      utterance.pitch = 1.0;

      // Try to find Urdu voice, fall back to Hindi, then default
      const voices = speechSynthesis.getVoices();
      const urduVoice = voices.find(v => v.lang.startsWith('ur'))
        || voices.find(v => v.lang.startsWith('hi'))
        || voices.find(v => v.lang.includes('IN'))
        || null;

      if (urduVoice) utterance.voice = urduVoice;

      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };

      speechSynthesis.cancel(); // Cancel any pending
      speechSynthesis.speak(utterance);
    });
  }, [isMuted]);

  // Send audio to our API and get AI response
  const processAudio = useCallback(async (audioBlob: Blob) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      formData.append('sessionId', sessionIdRef.current);

      // Add GPS coords if available
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          formData.append('lat', pos.coords.latitude.toString());
          formData.append('lng', pos.coords.longitude.toString());
        } catch { /* GPS not available — fine */ }
      }

      console.log('[CALL] Sending audio to /api/voice/chat...');
      const res = await fetch('/api/voice/chat', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      console.log('[CALL] Response:', data);

      // Show transcript
      if (data.transcript) {
        onTranscript(data.transcript, 'user');
        store.setTranscript(data.transcript);
      }

      // Handle tool call
      if (data.toolCall && data.incident_id) {
        onIncidentReported({
          landmark: data.toolCall.landmark || 'GPS Location',
          incident_type: data.toolCall.incident_type || 'medical',
          severity: data.toolCall.severity || 3,
        });
        store.setIncidentId(data.incident_id);
        store.setAgentStatus('broadcasting');
      }

      // Speak AI response
      if (data.text) {
        onTranscript(data.text, 'assistant');
        await speak(data.text);
      }

      turnCountRef.current++;

      // If incident reported, stop further turns
      if (data.incident_id) {
        turnCountRef.current = 999; // Prevent auto-restart
      }

    } catch (err) {
      console.error('[CALL] Process error:', err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [onTranscript, onIncidentReported, store, speak]);

  // Start recording a turn
  const startListening = useCallback(() => {
    if (!streamRef.current || isProcessingRef.current || isSpeaking) return;

    chunksRef.current = [];
    setIsListening(true);

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      setIsListening(false);
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      if (blob.size > 1000) { // Only process if meaningful audio
        processAudio(blob);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();

    // Auto-stop after 8 seconds (one turn)
    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, 8000);
  }, [processAudio, isSpeaking]);

  // Start the call
  const startCall = useCallback(async () => {
    if (isCallActive || isConnecting) return;
    setIsConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;

      setIsCallActive(true);
      setIsConnecting(false);
      onCallStart();
      store.setAgentStatus('listening');

      // Speak first message
      await speak('Waasta Emergency. Kya hua hai?');

      // Start first listening turn
      startListening();

    } catch (err) {
      console.error('[CALL] Start failed:', err);
      setIsConnecting(false);
    }
  }, [isCallActive, isConnecting, onCallStart, store, speak, startListening]);

  // End the call
  const endCall = useCallback(() => {
    console.log('[CALL] Ending call');
    // Stop everything immediately
    isProcessingRef.current = true; // Block any new processing
    turnCountRef.current = 999; // Block auto-restart
    speechSynthesis.cancel();
    try { mediaRecorderRef.current?.stop(); } catch { /* ok */ }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setIsCallActive(false);
    setIsConnecting(false);
    setIsListening(false);
    setIsSpeaking(false);
    onCallEnd();
  }, [onCallEnd]);

  // Auto-restart listening after AI finishes speaking
  useEffect(() => {
    if (isCallActive && !isSpeaking && !isListening && !isProcessingRef.current && turnCountRef.current < 10 && streamRef.current) {
      const timeout = setTimeout(startListening, 500);
      return () => clearTimeout(timeout);
    }
  }, [isCallActive, isSpeaking, isListening, startListening]);

  // Auto-start
  useEffect(() => {
    if (autoStart && !isCallActive && !isConnecting) {
      startCall();
    }
  }, [autoStart, isCallActive, isConnecting, startCall]);

  // Force end
  useEffect(() => {
    if (forceEnd && isCallActive) {
      endCall();
    }
  }, [forceEnd, isCallActive, endCall]);

  // Cleanup
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Load voices
  useEffect(() => {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }, []);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!isCallActive && !isConnecting ? (
          <motion.button
            key="start"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={startCall}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
              <Phone className="w-4 h-4 text-orange-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-zinc-800">Waasta AI se baat karein</div>
              <div className="text-[11px] text-zinc-500">Voice mein apni emergency batayein</div>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden"
          >
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isConnecting ? '#f59e0b' : isListening ? '#ef4444' : isSpeaking ? '#22c55e' : '#22c55e' }}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                <span className="text-xs font-medium text-zinc-300">
                  {isConnecting ? 'Connecting...' : isListening ? 'Sun raha hai...' : isSpeaking ? 'Bol raha hai...' : 'Waasta AI · Live'}
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] text-orange-400 border-orange-600/30">
                <Mic className="w-2.5 h-2.5 mr-1" />
                {isListening ? 'RECORDING' : isSpeaking ? 'SPEAKING' : 'ACTIVE'}
              </Badge>
            </div>

            <div className="px-4 py-4 flex items-center justify-center">
              <div className="flex items-center gap-1.5 h-8">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-1.5 rounded-full ${isListening ? 'bg-red-500' : isSpeaking ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                    animate={{
                      height: isListening || isSpeaking ? [8, 20 + Math.random() * 12, 8] : [4, 6, 4],
                    }}
                    transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.1 }}
                  />
                ))}
              </div>
            </div>

            <div className="px-4 pb-4 flex items-center justify-center gap-6">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsMuted(!isMuted)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  isMuted ? 'bg-amber-600/20 border border-amber-600/30 text-amber-400'
                    : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
                }`}
              >
                {isMuted ? <Volume2 className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
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
