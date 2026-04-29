// ============================================================
// WAASTA v2 — Core Type Definitions (no phone numbers)
// ============================================================

export interface Institute {
  id: string;
  name: string;
  type: 'ambulance' | 'fire' | 'police' | 'rescue';
  zone: string;
  lat: number;
  lng: number;
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
  transcript: string | null;
  summary: string | null;
  incident_type: 'accident' | 'fire' | 'medical' | 'crime' | 'other' | null;
  severity: number | null;
  landmark: string | null;
  zone: string | null;
  lat: number | null;
  lng: number | null;
  status: 'intake' | 'geocoded' | 'broadcasting' | 'accepted' | 'dispatched' | 'en_route' | 'on_scene' | 'returning' | 'resolved' | 'cancelled';
  accepted_by: string | null;
  assigned_resource: string | null;
  exclude_list: string[];
  route_waypoints: [number, number][] | null;
  route_distance_km: number | null;
  route_duration_min: number | null;
  route_progress_step: number | null;
  search_trace: SearchTrace | null;
  created_at: string;
  updated_at: string;
}

// A* search instrumentation written by the broker LangGraph node.
// `path` is start → goal node sequence; `expanded_nodes` are popped
// from the OPEN set in the order A* visited them (useful for viz).
export interface SearchTrace {
  algorithm: 'A*' | 'haversine_fallback';
  path?: Array<{ id: string; label: string; lat: number; lng: number; kind: 'landmark' | 'institute' | 'incident' }>;
  cost_km: number;
  hops?: number;
  expanded_nodes?: Array<{ id: string; label: string; lat: number; lng: number; kind: 'landmark' | 'institute' | 'incident' }>;
  total_nodes?: number;
  took_ms?: number;
  heuristic?: string;
  chosen_institute: { id: string; name: string } | null;
  reason?: string;
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
  | 'en_route'
  | 'on_scene';
