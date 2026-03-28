import { create } from 'zustand';
import type { AgentStatus, Incident, IncidentBroadcast, Resource } from '@/types';

interface WaastaStore {
  agentStatus: AgentStatus;
  transcript: string;
  incidentId: string | null;
  incident: Incident | null;
  assignedResource: Resource | null;
  broadcastId: string | null;
  eta: number | null;

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

// ── Institution Store with Broadcast Queue ──
interface InstitutionStore {
  activeBroadcast: (IncidentBroadcast & { incidents?: Incident }) | null;
  broadcastQueue: (IncidentBroadcast & { incidents?: Incident })[];
  incidents: Incident[];
  isBusy: boolean;

  // Queue a broadcast — shows popup only if not busy
  queueBroadcast: (b: IncidentBroadcast & { incidents?: Incident }) => void;
  // Legacy direct set (used by pending check on load)
  setActiveBroadcast: (b: InstitutionStore['activeBroadcast']) => void;
  setIncidents: (i: Incident[]) => void;

  // Dismiss popup WITHOUT promoting next (used on ACCEPT — stay busy)
  dismissBroadcast: () => void;
  // Finish current call — clears busy, promotes next from queue (used on dismiss/resolve)
  finishCall: () => void;
  // Legacy alias
  clearBroadcast: () => void;

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
      console.log('[STORE] Showing broadcast immediately (not busy)');
      set({ activeBroadcast: b });
    } else {
      console.log('[STORE] Queued broadcast (busy):', b.incident_id);
      set((state) => ({ broadcastQueue: [...state.broadcastQueue, b] }));
    }
  },

  setActiveBroadcast: (activeBroadcast) => set({ activeBroadcast }),
  setIncidents: (incidents) => set({ incidents }),

  // ACCEPT: dismiss popup, stay busy, do NOT show next
  dismissBroadcast: () => {
    console.log('[STORE] Dismissed broadcast (staying busy)');
    set({ activeBroadcast: null });
  },

  // DONE: clear busy, promote next queued broadcast
  finishCall: () => {
    const { broadcastQueue } = get();
    if (broadcastQueue.length > 0) {
      const [next, ...rest] = broadcastQueue;
      console.log('[STORE] Promoting next from queue:', next.incident_id);
      set({ activeBroadcast: next, broadcastQueue: rest, isBusy: false });
    } else {
      console.log('[STORE] Queue empty — free');
      set({ activeBroadcast: null, isBusy: false });
    }
  },

  // Legacy alias — same as finishCall
  clearBroadcast: () => {
    get().finishCall();
  },

  setBusy: (isBusy) => set({ isBusy }),
}));
