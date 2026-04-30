// ============================================================
// POST /api/admin/reset
//
// Server-side equivalent of supabase/reset.sql:
//   1. Delete every incident_broadcasts row
//   2. Delete every incidents row
//   3. Reset every resource: lat/lng → its institute's station, status → 'available'
//
// Uses the service role key so RLS doesn't block the deletes / wide updates.
// Triggered from the dashboard's "RECALL ALL" button. Confirmation happens
// client-side; this endpoint just executes.
// ============================================================

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

export async function POST() {
  const supabase = createServiceClient();
  const t0 = Date.now();

  try {
    // 1. Wipe broadcasts (FK cascade would also handle this, but explicit is safer).
    const { error: bcErr } = await supabase
      .from('incident_broadcasts')
      .delete()
      .neq('id', SENTINEL_UUID);
    if (bcErr) throw new Error(`incident_broadcasts: ${bcErr.message}`);

    // 2. Wipe incidents.
    const { error: incErr } = await supabase
      .from('incidents')
      .delete()
      .neq('id', SENTINEL_UUID);
    if (incErr) throw new Error(`incidents: ${incErr.message}`);

    // 3. Read each institute, then send every one of its resources back home.
    //    Mirrors the supabase/reset.sql query (which assumes a single Edhi
    //    institute) but generalises so multi-institute setups also work.
    const { data: institutes, error: instErr } = await supabase
      .from('institutes')
      .select('id, lat, lng');
    if (instErr) throw new Error(`institutes: ${instErr.message}`);
    if (!institutes || institutes.length === 0) {
      return NextResponse.json({ error: 'No institutes found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    let resetCount = 0;
    for (const inst of institutes) {
      const { count, error: resErr } = await supabase
        .from('resources')
        .update({ lat: inst.lat, lng: inst.lng, status: 'available', updated_at: now }, { count: 'exact' })
        .eq('institute_id', inst.id);
      if (resErr) throw new Error(`resources(${inst.id.slice(0, 8)}): ${resErr.message}`);
      resetCount += count ?? 0;
    }

    const ms = Date.now() - t0;
    console.log(`[ADMIN:RESET] cleared incidents/broadcasts, recalled ${resetCount} resources in ${ms}ms`);

    return NextResponse.json({
      success: true,
      institutes: institutes.length,
      resources_reset: resetCount,
      took_ms: ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ADMIN:RESET] failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
