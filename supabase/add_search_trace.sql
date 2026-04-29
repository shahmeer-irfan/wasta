-- ============================================================
-- Migration: A* search trace
--
-- Adds a JSONB column on incidents that stores the broker's A*
-- search instrumentation: the path it picked, every node it
-- expanded (in expansion order), the total cost, and how long
-- the algorithm took. Used by the dashboard's "A* trace" badge
-- and useful for academic write-up (you can pull a specific
-- incident's trace and analyse it).
--
-- Run this in the Supabase SQL Editor AFTER schema_v2.sql and
-- add_route_columns.sql.
-- ============================================================

ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS search_trace JSONB DEFAULT NULL;

-- Index helps when querying recent traces for analytics.
CREATE INDEX IF NOT EXISTS idx_incidents_search_trace_algo
  ON incidents ((search_trace->>'algorithm'))
  WHERE search_trace IS NOT NULL;

-- Document the column so future devs know what's in it.
COMMENT ON COLUMN incidents.search_trace IS
  'A* search instrumentation from the broker node. Schema:
   {
     algorithm: "A*" | "haversine_fallback",
     path: [{ id, label, lat, lng, kind }, ...],
     cost_km: number,
     hops: number,
     expanded_nodes: [{ id, label, lat, lng, kind }, ...],
     total_nodes: number,
     took_ms: number,
     heuristic: "haversine_to_nearest_goal",
     chosen_institute: { id, name }
   }';
