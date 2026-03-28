-- ============================================================
-- WAASTA — Quick Reset
-- Run this anytime to clear all incidents and reset ambulances
-- ============================================================

-- Clear all incidents and broadcasts
DELETE FROM incident_broadcasts;
DELETE FROM incidents;

-- Reset all ambulances to Edhi station coordinates + available status
UPDATE resources SET
  lat = (SELECT lat FROM institutes WHERE name LIKE 'Edhi%' LIMIT 1),
  lng = (SELECT lng FROM institutes WHERE name LIKE 'Edhi%' LIMIT 1),
  status = 'available',
  updated_at = NOW();
