-- ============================================================
-- WAASTA v2 — Clean Schema (replaces old Twilio-era schema)
-- Run this in Supabase SQL Editor
-- ============================================================
-- STEP 1: Drop old tables (cascades foreign keys)
-- ============================================================
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS incident_broadcasts CASCADE;
DROP TABLE IF EXISTS incidents CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS institutes CASCADE;

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. INSTITUTES — One institute for demo (Edhi)
-- No phone numbers. Just name, zone, coordinates.
-- ============================================================
CREATE TABLE institutes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ambulance', 'fire', 'police', 'rescue')),
  zone TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. RESOURCES — Ambulances / vehicles with live position
-- ============================================================
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id UUID REFERENCES institutes(id) ON DELETE CASCADE,
  call_sign TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ambulance', 'fire_truck', 'patrol', 'rescue_van')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'dispatched', 'en_route', 'on_scene', 'returning')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. INCIDENTS — Each emergency
-- ============================================================
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transcript TEXT,
  summary TEXT,
  incident_type TEXT CHECK (incident_type IN ('accident', 'fire', 'medical', 'crime', 'other')),
  severity INT CHECK (severity BETWEEN 1 AND 5),
  landmark TEXT,
  zone TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT DEFAULT 'intake' CHECK (status IN ('intake', 'geocoded', 'broadcasting', 'accepted', 'dispatched', 'en_route', 'on_scene', 'resolved', 'cancelled')),
  accepted_by UUID REFERENCES institutes(id),
  assigned_resource UUID REFERENCES resources(id),
  exclude_list UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. INCIDENT_BROADCASTS — Handshake between system and institute
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
-- INDEXES
-- ============================================================
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_broadcasts_incident ON incident_broadcasts(incident_id);
CREATE INDEX idx_broadcasts_institute ON incident_broadcasts(institute_id);
CREATE INDEX idx_broadcasts_status ON incident_broadcasts(status);
CREATE INDEX idx_resources_status ON resources(status);
CREATE INDEX idx_resources_institute ON resources(institute_id);

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE incident_broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE resources;

-- ============================================================
-- SEED: One institute (Edhi) with 3 ambulances
-- This is all you need for the demo
-- ============================================================
INSERT INTO institutes (name, type, zone, lat, lng) VALUES
  ('Edhi Foundation - Gulshan', 'ambulance', 'Gulshan', 24.9210, 67.0935);

-- 3 ambulances AT Edhi station (exact same coordinates)
INSERT INTO resources (institute_id, call_sign, type, lat, lng, status)
SELECT i.id, 'EDH-01', 'ambulance', i.lat, i.lng, 'available' FROM institutes i WHERE i.name LIKE 'Edhi%';
INSERT INTO resources (institute_id, call_sign, type, lat, lng, status)
SELECT i.id, 'EDH-02', 'ambulance', i.lat, i.lng, 'available' FROM institutes i WHERE i.name LIKE 'Edhi%';
INSERT INTO resources (institute_id, call_sign, type, lat, lng, status)
SELECT i.id, 'EDH-03', 'ambulance', i.lat, i.lng, 'available' FROM institutes i WHERE i.name LIKE 'Edhi%';
