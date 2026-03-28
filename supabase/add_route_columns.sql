-- Add route columns to incidents table
-- Run this in Supabase SQL Editor AFTER schema_v2.sql
ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS route_waypoints jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS route_distance_km float DEFAULT NULL,
ADD COLUMN IF NOT EXISTS route_duration_min float DEFAULT NULL,
ADD COLUMN IF NOT EXISTS route_progress_step int DEFAULT 0;
