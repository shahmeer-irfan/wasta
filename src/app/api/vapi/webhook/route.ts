import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/client';
import { KARACHI_LANDMARKS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// Vapi Webhook — receives tool-calls from the Vapi assistant
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Vapi sends different message types
  const { message } = body;

  if (!message) {
    return NextResponse.json({ error: 'No message' }, { status: 400 });
  }

  // Handle tool calls (function calls from the AI assistant)
  if (message.type === 'tool-calls') {
    const toolCalls = message.toolCalls || [];
    const results = [];

    for (const call of toolCalls) {
      if (call.function?.name === 'report_incident') {
        const args = call.function.arguments || {};
        const result = await handleReportIncident(args);
        results.push({
          toolCallId: call.id,
          result: JSON.stringify(result),
        });
      } else {
        results.push({
          toolCallId: call.id,
          result: JSON.stringify({ status: 'unknown_function' }),
        });
      }
    }

    return NextResponse.json({ results });
  }

  // Handle function-call (legacy format)
  if (message.type === 'function-call' && message.functionCall?.name === 'report_incident') {
    const args = message.functionCall.parameters || {};
    const result = await handleReportIncident(args);
    return NextResponse.json({ result: JSON.stringify(result) });
  }

  // Handle end-of-call report
  if (message.type === 'end-of-call-report') {
    // Could log call summary to Supabase
    return NextResponse.json({ status: 'received' });
  }

  // Default — acknowledge
  return NextResponse.json({ status: 'ok' });
}

// ── Core: Report Incident Handler ──
async function handleReportIncident(args: Record<string, unknown>) {
  const supabase = createServiceClient();

  const landmark = (args.landmark as string) || '';
  const incident_type = (args.incident_type as string) || 'other';
  const severity = Math.min(5, Math.max(1, (args.severity as number) || 3));
  const summary = (args.summary as string) || '';
  const transcript = (args.transcript as string) || '';

  // Geocode using Karachi landmarks
  const landmarkLower = landmark.toLowerCase();
  let matchedLandmark = KARACHI_LANDMARKS.find(
    (lm) => landmarkLower.includes(lm.name.toLowerCase())
  );

  // Fuzzy fallback — match individual words
  if (!matchedLandmark) {
    let bestScore = 0;
    for (const lm of KARACHI_LANDMARKS) {
      const words = lm.name.toLowerCase().split(/\s+/);
      let score = 0;
      for (const word of words) {
        if (word.length > 2 && landmarkLower.includes(word)) {
          score += word.length;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        matchedLandmark = lm;
      }
    }
    // Require minimum match quality
    if (bestScore < 3) matchedLandmark = undefined;
  }

  // Create incident in Supabase
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      transcript,
      summary: summary || `${incident_type} reported near ${landmark}`,
      incident_type: validateIncidentType(incident_type),
      severity,
      landmark: matchedLandmark?.name || landmark,
      zone: matchedLandmark?.zone || null,
      lat: matchedLandmark?.lat || null,
      lng: matchedLandmark?.lng || null,
      status: matchedLandmark ? 'geocoded' : 'intake',
    })
    .select()
    .single();

  if (error || !incident) {
    return {
      success: false,
      message: 'Failed to create incident record.',
    };
  }

  // Find nearest available institute
  const neededType = incident_type === 'fire' ? 'fire' : 'ambulance';
  const { data: institutes } = await supabase
    .from('institutes')
    .select('*')
    .eq('is_available', true)
    .eq('type', neededType);

  if (!institutes?.length) {
    return {
      success: true,
      incident_id: incident.id,
      message: `I've recorded a ${incident_type} emergency near ${matchedLandmark?.name || landmark}. No responders currently available — escalating.`,
    };
  }

  // Find nearest by haversine
  const lat = matchedLandmark?.lat || 24.8607;
  const lng = matchedLandmark?.lng || 67.0011;

  const nearest = institutes.reduce((best, inst) => {
    const d = haversine(lat, lng, inst.lat, inst.lng);
    const dBest = haversine(lat, lng, best.lat, best.lng);
    return d < dBest ? inst : best;
  });

  // Create broadcast
  await supabase.from('incident_broadcasts').insert({
    incident_id: incident.id,
    institute_id: nearest.id,
    status: 'pending',
    confidence: 0.92,
  });

  // Update incident status
  await supabase.from('incidents').update({
    status: 'broadcasting',
  }).eq('id', incident.id);

  return {
    success: true,
    incident_id: incident.id,
    landmark: matchedLandmark?.name || landmark,
    zone: matchedLandmark?.zone || 'Unknown',
    responder: nearest.name,
    message: `I've found ${nearest.name} near ${matchedLandmark?.name || landmark}. An ambulance has been dispatched. Stay on the line.`,
  };
}

function validateIncidentType(type: string): string {
  const valid = ['accident', 'fire', 'medical', 'crime', 'other'];
  return valid.includes(type) ? type : 'other';
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
