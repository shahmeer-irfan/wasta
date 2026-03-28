-- ============================================================
-- GUARDIAN (SAHAS 2.0) — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- 1. INSTITUTES (Rescue orgs: Edhi, Chhipa, Aman, etc.)
-- ============================================================
CREATE TABLE institutes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ambulance', 'fire', 'police', 'rescue')),
  phone TEXT NOT NULL,
  zone TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  capacity INT DEFAULT 5,
  active_units INT DEFAULT 5,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. RESOURCES (Individual ambulances / units)
-- ============================================================
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id UUID REFERENCES institutes(id) ON DELETE CASCADE,
  call_sign TEXT NOT NULL,          -- e.g. "Amb-07"
  type TEXT NOT NULL CHECK (type IN ('ambulance', 'fire_truck', 'patrol', 'rescue_van')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'dispatched', 'en_route', 'on_scene', 'returning')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. INCIDENTS (Each emergency call)
-- ============================================================
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caller_phone TEXT,
  transcript TEXT,
  summary TEXT,                     -- Roman Urdu AI summary
  incident_type TEXT CHECK (incident_type IN ('accident', 'fire', 'medical', 'crime', 'other')),
  severity INT CHECK (severity BETWEEN 1 AND 5),
  landmark TEXT,
  zone TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT DEFAULT 'intake' CHECK (status IN ('intake', 'geocoded', 'broadcasting', 'accepted', 'dispatched', 'resolved', 'cancelled')),
  accepted_by UUID REFERENCES institutes(id),
  assigned_resource UUID REFERENCES resources(id),
  exclude_list UUID[] DEFAULT '{}',  -- Rejected institute IDs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. INCIDENT_BROADCASTS (HITL handshake records)
-- ============================================================
CREATE TABLE incident_broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  institute_id UUID REFERENCES institutes(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  confidence DOUBLE PRECISION DEFAULT 0.92,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- ============================================================
-- 5. CALL_LOGS (Voice bridge records)
-- ============================================================
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  caller_phone TEXT,
  institute_phone TEXT,
  session_id TEXT,
  status TEXT DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'connected', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_broadcasts_incident ON incident_broadcasts(incident_id);
CREATE INDEX idx_broadcasts_institute ON incident_broadcasts(institute_id);
CREATE INDEX idx_broadcasts_status ON incident_broadcasts(status);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_institute ON resources(institute_id);

-- ============================================================
-- REALTIME — Enable for live subscriptions
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE incident_broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE resources;

-- ============================================================
-- SEED DATA — Karachi Rescue Institutes
-- ============================================================
INSERT INTO institutes (name, type, phone, zone, lat, lng, capacity, active_units) VALUES
  ('Edhi Foundation - Gulshan', 'ambulance', '+92-21-115', 'Gulshan', 24.9210, 67.0935, 8, 6),
  ('Chhipa Ambulance - PECHS', 'ambulance', '+92-21-1021', 'PECHS', 24.8620, 67.0550, 5, 4),
  ('Aman Foundation - DHA', 'ambulance', '+92-21-1166', 'DHA', 24.8000, 67.0650, 6, 5),
  ('KFD Station 5 - FB Area', 'fire', '+92-21-16', 'FB Area', 24.9320, 67.0910, 3, 3),
  ('Rescue 1122 - Gulshan', 'rescue', '+92-21-1122', 'Gulshan', 24.9180, 67.0980, 4, 3);

-- Seed resources (ambulances)
INSERT INTO resources (institute_id, call_sign, type, lat, lng, status)
SELECT
  i.id,
  'Amb-0' || n,
  'ambulance',
  i.lat + (random() - 0.5) * 0.01,
  i.lng + (random() - 0.5) * 0.01,
  'available'
FROM institutes i
CROSS JOIN generate_series(1, 3) AS n
WHERE i.type = 'ambulance';

-- Fire trucks
INSERT INTO resources (institute_id, call_sign, type, lat, lng, status)
SELECT
  i.id,
  'FT-0' || n,
  'fire_truck',
  i.lat + (random() - 0.5) * 0.008,
  i.lng + (random() - 0.5) * 0.008,
  'available'
FROM institutes i
CROSS JOIN generate_series(1, 2) AS n
WHERE i.type = 'fire';
