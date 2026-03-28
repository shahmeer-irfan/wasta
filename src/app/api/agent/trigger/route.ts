import { NextRequest, NextResponse } from 'next/server';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { transcript, lat, lng } = await req.json();

  console.log('[TRIGGER] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[TRIGGER] transcript:', transcript?.substring(0, 80));
  console.log('[TRIGGER] user coords:', lat, lng);

  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'Empty transcript' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Create incident WITH user's live coordinates if available
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      transcript,
      status: 'intake',
      // Store user's live location as initial coords (graph can override with landmark)
      ...(lat && lng ? { lat, lng } : {}),
    })
    .select()
    .single();

  if (error || !incident) {
    console.error('[TRIGGER] Insert failed:', error?.message);
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }

  console.log('[TRIGGER] Created incident:', incident.id);

  const graph = buildWaastaGraph();

  try {
    const result = await graph.invoke({
      transcript,
      incident_id: incident.id,
    });

    console.log('[TRIGGER] Graph result → status:', result.status, 'broadcast:', result.broadcast_id);

    // If graph didn't geocode but we have user coords, update incident
    if (!result.incident_card?.lat && lat && lng) {
      console.log('[TRIGGER] Using user GPS coords as fallback');
      await supabase.from('incidents').update({
        lat,
        lng,
        status: result.status === 'error' ? 'geocoded' : result.status,
        updated_at: new Date().toISOString(),
      }).eq('id', incident.id);
    }

    // If graph errored without creating broadcast, force-create one with user coords
    if (result.status === 'error' && lat && lng) {
      console.log('[TRIGGER] Graph errored — force-creating broadcast with GPS coords');

      const { data: institutes } = await supabase
        .from('institutes')
        .select('*')
        .eq('is_available', true);

      if (institutes?.length) {
        const nearest = institutes[0]; // Only one institute in demo
        await supabase.from('incident_broadcasts').insert({
          incident_id: incident.id,
          institute_id: nearest.id,
          status: 'pending',
          confidence: 0.85,
        });
        await supabase.from('incidents').update({
          lat, lng,
          status: 'broadcasting',
          updated_at: new Date().toISOString(),
        }).eq('id', incident.id);

        return NextResponse.json({
          incident_id: incident.id,
          status: 'broadcasting',
          broadcast_id: null,
          landmark: 'GPS Location',
          lat, lng,
        });
      }
    }

    return NextResponse.json({
      incident_id: incident.id,
      status: result.status,
      broadcast_id: result.broadcast_id || null,
      landmark: result.landmark_match?.name || null,
      lat: result.incident_card?.lat || lat || null,
      lng: result.incident_card?.lng || lng || null,
    });
  } catch (err) {
    console.error('[TRIGGER] Graph error:', err);

    // Even on error, try to create a broadcast if we have coords
    if (lat && lng) {
      const { data: institutes } = await supabase
        .from('institutes')
        .select('*')
        .eq('is_available', true)
        .limit(1);

      if (institutes?.length) {
        await supabase.from('incident_broadcasts').insert({
          incident_id: incident.id,
          institute_id: institutes[0].id,
          status: 'pending',
          confidence: 0.7,
        });
        await supabase.from('incidents').update({
          lat, lng,
          status: 'broadcasting',
          updated_at: new Date().toISOString(),
        }).eq('id', incident.id);

        return NextResponse.json({
          incident_id: incident.id,
          status: 'broadcasting',
          lat, lng,
        });
      }
    }

    await supabase.from('incidents').update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', incident.id);

    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
