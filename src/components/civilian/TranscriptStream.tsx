'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Mic, Brain, MapPin } from 'lucide-react';
import type { AgentStatus } from '@/types';

interface TranscriptStreamProps {
  transcript: string;
  agentStatus: AgentStatus;
  landmark?: string | null;
}

export default function TranscriptStream({
  transcript,
  agentStatus,
  landmark,
}: TranscriptStreamProps) {
  const isAnalyzing = ['analyzing', 'geocoding'].includes(agentStatus);
  const isListening = agentStatus === 'listening';

  return (
    <div className="space-y-3">
      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <AnimatePresence mode="wait">
          {isListening && (
            <motion.div
              key="listening"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Badge variant="outline" className="border-red-600/50 text-red-400 gap-1.5">
                <Mic className="w-3 h-3 animate-pulse" />
                Live Transcript
              </Badge>
            </motion.div>
          )}
          {isAnalyzing && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Badge variant="outline" className="border-amber-500/50 text-amber-400 gap-1.5 glow-amber">
                <Brain className="w-3 h-3 animate-pulse" />
                AI Analyzing...
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Landmark badge */}
        <AnimatePresence>
          {landmark && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 gap-1.5">
                <MapPin className="w-3 h-3" />
                {landmark}
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Transcript text */}
      {transcript && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-zinc-900/80 rounded-xl p-4 border border-zinc-800/50 max-h-32 overflow-y-auto"
        >
          <p className="text-sm text-zinc-300 leading-relaxed font-mono">
            {transcript}
            {isListening && (
              <motion.span
                className="inline-block w-1.5 h-4 bg-red-500 ml-1 -mb-0.5"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            )}
          </p>
        </motion.div>
      )}
    </div>
  );
}
