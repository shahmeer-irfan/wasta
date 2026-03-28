'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Phone, X, MapPin, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SEVERITY_LABELS, SEVERITY_COLORS } from '@/lib/constants';
import type { Incident, IncidentBroadcast } from '@/types';

interface BroadcastModalProps {
  broadcast: IncidentBroadcast & { incidents?: Incident };
  onAccept: () => void;
  onReject: () => void;
  isResponding: boolean;
}

export default function BroadcastModal({
  broadcast,
  onAccept,
  onReject,
  isResponding,
}: BroadcastModalProps) {
  const incident = broadcast.incidents;
  if (!incident) return null;

  const confidence = Math.round((broadcast.confidence || 0.92) * 100);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Outer pulse */}
        <motion.div
          className="absolute inset-0 border-2 border-red-600/20"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        <motion.div
          className="relative w-full max-w-lg mx-4 bg-zinc-900 border border-red-600/30 rounded-2xl overflow-hidden glow-red"
          initial={{ scale: 0.8, y: 40 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          {/* Urgency strip */}
          <motion.div
            className="h-1 bg-red-600"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />

          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-12 h-12 rounded-xl bg-red-600/15 border border-red-600/30 flex items-center justify-center"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </motion.div>
                <div>
                  <div className="text-xs text-red-400 font-semibold tracking-wider uppercase">
                    Incoming Emergency
                  </div>
                  <div className="text-lg font-bold text-zinc-100 mt-0.5">
                    {incident.incident_type?.toUpperCase().replace('_', ' ')} REPORTED
                  </div>
                </div>
              </div>
            </div>

            {/* Location + confidence */}
            <div className="bg-zinc-800/50 rounded-xl p-4 mb-4 border border-zinc-700/50">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-red-400" />
                <span className="text-base font-semibold text-zinc-100">
                  {incident.landmark || 'Unknown Location'}
                </span>
                <Badge className="ml-auto bg-red-600/20 text-red-400 border-red-600/30 text-[10px]">
                  {confidence}% Confidence
                </Badge>
              </div>
              {incident.zone && (
                <span className="text-xs text-zinc-500">Zone: {incident.zone}</span>
              )}
            </div>

            {/* Summary */}
            {incident.summary && (
              <div className="bg-zinc-800/30 rounded-xl p-4 mb-4 border border-zinc-800/50">
                <p className="text-sm text-zinc-300 leading-relaxed italic">
                  &ldquo;{incident.summary}&rdquo;
                </p>
              </div>
            )}

            {/* Severity + Meta */}
            <div className="flex items-center gap-3 mb-6">
              {incident.severity && (
                <Badge
                  variant="outline"
                  className={`${SEVERITY_COLORS[incident.severity]} border-current/30`}
                >
                  <Activity className="w-3 h-3 mr-1" />
                  Severity: {SEVERITY_LABELS[incident.severity]}
                </Badge>
              )}
              <span className="text-xs text-zinc-600">
                {new Date(incident.created_at).toLocaleTimeString()}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                onClick={onReject}
                disabled={isResponding}
                variant="outline"
                className="flex-1 h-14 bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 text-base"
              >
                <X className="w-5 h-5 mr-2" />
                REJECT — BUSY
              </Button>
              <Button
                onClick={onAccept}
                disabled={isResponding}
                className="flex-1 h-14 bg-red-600 hover:bg-red-500 text-white text-base font-semibold glow-red"
              >
                <Phone className="w-5 h-5 mr-2" />
                ACCEPT & PATCH
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
