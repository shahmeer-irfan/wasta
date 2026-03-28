// ============================================================
// VAASTA — Core Type Definitions
// ============================================================

export interface Institute {
  id: string;
  name: string;
  type: 'ambulance' | 'fire' | 'police' | 'rescue';
  phone: string;
  zone: string;
  lat: number;
  lng: number;
  capacity: number;
  active_units: number;
  is_available: boolean;
  created_at: string;
}

export interface Resource {
  id: string;
  institute_id: string;
  call_sign: string;
  type: 'ambulance' | 'fire_truck' | 'patrol' | 'rescue_van';
  lat: number;
  lng: number;
  status: 'available' | 'dispatched' | 'en_route' | 'on_scene' | 'returning';
  updated_at: string;
}

export interface Incident {
  id: string;
  caller_phone: string | null;
  transcript: string | null;
  summary: string | null;
  incident_type: 'accident' | 'fire' | 'medical' | 'crime' | 'other' | null;
  severity: number | null;
  landmark: string | null;
  zone: string | null;
  lat: number | null;
  lng: number | null;
  status: 'intake' | 'geocoded' | 'broadcasting' | 'accepted' | 'dispatched' | 'resolved' | 'cancelled';
  accepted_by: string | null;
  assigned_resource: string | null;
  exclude_list: string[];
  created_at: string;
  updated_at: string;
}

export interface IncidentBroadcast {
  id: string;
  incident_id: string;
  institute_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  confidence: number;
  sent_at: string;
  responded_at: string | null;
}

export interface CallLog {
  id: string;
  incident_id: string;
  caller_phone: string | null;
  institute_phone: string | null;
  session_id: string | null;
  status: 'initiated' | 'ringing' | 'connected' | 'completed' | 'failed';
  started_at: string;
  ended_at: string | null;
}

export interface IncidentCard {
  incident_type: Incident['incident_type'];
  summary: string;
  severity: number;
  landmark: string | null;
  zone: string | null;
  lat: number | null;
  lng: number | null;
}

export interface LandmarkData {
  name: string;
  lat: number;
  lng: number;
  zone: string;
}

export type AgentStatus =
  | 'idle'
  | 'listening'
  | 'analyzing'
  | 'geocoding'
  | 'broadcasting'
  | 'waiting_response'
  | 'accepted'
  | 'dispatched'
  | 'patching';
