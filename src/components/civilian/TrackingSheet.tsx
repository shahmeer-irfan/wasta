'use client';

import { motion } from 'framer-motion';
import { Ambulance, Clock, Phone, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { STATUS_STEPS, SEVERITY_LABELS, SEVERITY_COLORS } from '@/lib/constants';
import type { Incident, Resource } from '@/types';

interface TrackingSheetProps {
  incident: Incident;
  resource: Resource | null;
  eta: number | null;
  instituteName?: string;
}

export default function TrackingSheet({
  incident,
  resource,
  eta,
  instituteName,
}: TrackingSheetProps) {
  const currentStepIndex = getStepIndex(incident.status, resource?.status);

  return (
    <motion.div
      initial={{ y: 300, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      className="bg-orange-50/95 backdrop-blur-xl border-t border-orange-200 rounded-t-3xl p-5 pb-8"
    >
      {/* Drag handle */}
      <div className="flex justify-center mb-4">
        <div className="w-10 h-1 rounded-full bg-orange-200" />
      </div>

      {/* Resource card */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Ambulance className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900">
                {resource?.call_sign ?? 'Dispatching...'}
              </span>
              {instituteName && (
                <span className="text-xs text-zinc-500">· {instituteName}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {incident.severity && (
                <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[incident.severity]} border-current/30`}>
                  {SEVERITY_LABELS[incident.severity]}
                </Badge>
              )}
              <span className="text-xs text-zinc-500 capitalize">
                {incident.incident_type?.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* ETA — uses real OSRM data when available */}
        <div className="text-right">
          {incident.route_duration_min ? (
            <div>
              <motion.div
                className="text-2xl font-bold text-emerald-600"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {Math.max(0, Math.round(
                  incident.route_duration_min *
                  (1 - (incident.route_progress_step ?? 0) /
                    Math.max(1, (incident.route_waypoints?.length ?? 1) - 1))
                ))} min
              </motion.div>
              <div className="text-[10px] text-gray-500 flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" />
                {incident.route_distance_km}km
              </div>
            </div>
          ) : eta !== null ? (
            <div>
              <motion.div
                className="text-2xl font-bold text-emerald-600"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {Math.ceil(eta / 60)} min
              </motion.div>
              <div className="text-[10px] text-gray-500 flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3" /> ETA
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Calculating...</div>
          )}
        </div>
      </div>

      {/* Route progress bar */}
      {incident.route_waypoints && incident.route_waypoints.length > 1 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
            <span>Ambulance en route</span>
            <span>
              {Math.round(
                ((incident.route_progress_step ?? 0) /
                  Math.max(1, incident.route_waypoints.length - 1)) * 100
              )}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
              initial={{ width: '0%' }}
              animate={{
                width: `${Math.round(
                  ((incident.route_progress_step ?? 0) /
                    Math.max(1, incident.route_waypoints.length - 1)) * 100
                )}%`
              }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Status timeline */}
      <div className="space-y-0">
        {STATUS_STEPS.slice(0, 5).map((step, i) => {
          const isCompleted = i < currentStepIndex;
          const isCurrent = i === currentStepIndex;

          return (
            <div key={step} className="flex items-center gap-3 py-1.5">
              <div className="flex flex-col items-center">
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : isCurrent ? (
                  <motion.div
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ArrowRight className="w-4 h-4 text-orange-500" />
                  </motion.div>
                ) : (
                  <Circle className="w-4 h-4 text-zinc-500" />
                )}
              </div>
              <span
                className={`text-sm ${
                  isCompleted
                    ? 'text-zinc-600'
                    : isCurrent
                    ? 'text-zinc-900 font-medium'
                    : 'text-zinc-600'
                }`}
              >
                {step}
                {isCurrent && step === 'Accepted' && instituteName && (
                  <span className="text-emerald-500 ml-1.5">by {instituteName}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Emergency call button */}
      {incident.status === 'dispatched' && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-4 w-full py-3 rounded-xl bg-orange-100 border border-orange-200 text-zinc-400 flex items-center justify-center gap-2 text-sm hover:bg-zinc-750"
        >
          <Phone className="w-4 h-4" />
          Call Responder
        </motion.button>
      )}
    </motion.div>
  );
}

function getStepIndex(incidentStatus: string, resourceStatus?: string): number {
  if (resourceStatus === 'on_scene') return 4;
  if (resourceStatus === 'en_route') return 3;
  if (incidentStatus === 'dispatched') return 3;
  if (incidentStatus === 'accepted') return 2;
  if (incidentStatus === 'broadcasting') return 1;
  return 0;
}
