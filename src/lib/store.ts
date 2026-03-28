import { create } from 'zustand';
import type { AgentStatus, Incident, IncidentBroadcast, Resource } from '@/types';

interface WaastaStore {
  // Civilian state
  agentStatus: AgentStatus;
  transcript: string;
  incidentId: string | null;
  incident: Incident | null;
  assignedResource: Resource | null;
  broadcastId: string | null;
  eta: number | null; // seconds

  // Actions
  setAgentStatus: (s: AgentStatus) => void;
  setTranscript: (t: string) => void;
  setIncidentId: (id: string) => void;
  setIncident: (i: Incident | null) => void;
  setAssignedResource: (r: Resource | null) => void;
  setBroadcastId: (id: string) => void;
  setEta: (eta: number | null) => void;
  reset: () => void;
}

export const useWaastaStore = create<WaastaStore>((set) => ({
  agentStatus: 'idle',
  transcript: '',
  incidentId: null,
  incident: null,
  assignedResource: null,
  broadcastId: null,
  eta: null,

  setAgentStatus: (agentStatus) => set({ agentStatus }),
  setTranscript: (transcript) => set({ transcript }),
  setIncidentId: (incidentId) => set({ incidentId }),
  setIncident: (incident) => set({ incident }),
  setAssignedResource: (assignedResource) => set({ assignedResource }),
  setBroadcastId: (broadcastId) => set({ broadcastId }),
  setEta: (eta) => set({ eta }),
  reset: () => set({
    agentStatus: 'idle',
    transcript: '',
    incidentId: null,
    incident: null,
    assignedResource: null,
    broadcastId: null,
    eta: null,
  }),
}));

// Institution store — with broadcast queue for concurrency
interface InstitutionStore {
  activeBroadcast: (IncidentBroadcast & { incidents?: Incident }) | null;
  broadcastQueue: (IncidentBroadcast & { incidents?: Incident })[];
  incidents: Incident[];
  isBusy: boolean; // true when on an active call/dispatch

  // Queue a broadcast — shows popup only if not busy
  queueBroadcast: (b: IncidentBroadcast & { incidents?: Incident }) => void;
  // Legacy — still used by pending broadcast check on load
  setActiveBroadcast: (b: InstitutionStore['activeBroadcast']) => void;
  setIncidents: (i: Incident[]) => void;
  clearBroadcast: () => void; // clears active, promotes next from queue
  setBusy: (busy: boolean) => void;
}

export const useInstitutionStore = create<InstitutionStore>((set, get) => ({
  activeBroadcast: null,
  broadcastQueue: [],
  incidents: [],
  isBusy: false,

  queueBroadcast: (b) => {
    const { activeBroadcast, isBusy } = get();
    if (!activeBroadcast && !isBusy) {
      // Not busy — show immediately
      set({ activeBroadcast: b });
    } else {
      // Busy — queue it
      console.log('[STORE] Broadcast queued (busy):', b.incident_id?.substring(0, 8));
      set((state) => ({ broadcastQueue: [...state.broadcastQueue, b] }));
    }
  },

  setActiveBroadcast: (activeBroadcast) => set({ activeBroadcast }),
  setIncidents: (incidents) => set({ incidents }),
  clearBroadcast: () => {
    const { broadcastQueue } = get();
    if (broadcastQueue.length > 0) {
      // Promote next from queue
      const [next, ...rest] = broadcastQueue;
      console.log('[STORE] Promoting next broadcast from queue:', next.incident_id?.substring(0, 8));
      set({ activeBroadcast: next, broadcastQueue: rest, isBusy: false });
    } else {
      set({ activeBroadcast: null, isBusy: false });
    }
  },
  setBusy: (isBusy) => set({ isBusy }),
}));
