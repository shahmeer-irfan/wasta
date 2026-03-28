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

// Institution store
interface InstitutionStore {
  activeBroadcast: (IncidentBroadcast & { incidents?: Incident }) | null;
  incidents: Incident[];
  setActiveBroadcast: (b: InstitutionStore['activeBroadcast']) => void;
  setIncidents: (i: Incident[]) => void;
  clearBroadcast: () => void;
}

export const useInstitutionStore = create<InstitutionStore>((set) => ({
  activeBroadcast: null,
  incidents: [],
  setActiveBroadcast: (activeBroadcast) => set({ activeBroadcast }),
  setIncidents: (incidents) => set({ incidents }),
  clearBroadcast: () => set({ activeBroadcast: null }),
}));
