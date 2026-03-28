import { NextRequest, NextResponse } from 'next/server';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// Track calls to prevent duplicates
const callIncidentMap = new Map<string, string>();

export async function POST(req: NextRequest) {
  const args = await req.json();

  console.log('[11LABS-TOOL] ━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[11LABS-TOOL] Args:', JSON.stringify(args));

  const supabase = createServiceClient();

  const landmark = (args.landmark as string) || 'GPS Location';
  const incident_type = (args.incident_type as string) || 'medical';
  const severity = Math.min(5, Math.max(1, (args.severity as number) || 3));
  const summary = (args.summary as string) || '';
  const transcript = (args.transcript as string) || `${incident_type}`;

  // Dedup by summary hash
  const dedupKey = `${incident_type}-${landmark}-${summary.substring(0, 30)}`;
  if (callIncidentMap.has(dedupKey)) {
    const existingId = callIncidentMap.get(dedupKey)!;
    console.log('[11LABS-TOOL] Duplicate, returning existing:', existingId.substring(0, 8));
    return NextResponse.json({
      message: `Aapki emergency pehle se record hai. Rescue team ko notify kar diya gaya hai.`,
      incident_id: existingId,
    });
  }

  // Create incident
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      transcript,
      summary: summary || `${incident_type} reported`,
      incident_type: validateType(incident_type),
      severity,
      landmark,
      status: 'intake',
    })
    .select()
    .single();

  if (error || !incident) {
    console.error('[11LABS-TOOL] Create failed:', error?.message);
    return NextResponse.json({ message: 'System error. Dobara try karein.' });
  }

  console.log('[11LABS-TOOL] Created incident:', incident.id);

  // Store dedup
  callIncidentMap.set(dedupKey, incident.id);
  setTimeout(() => callIncidentMap.delete(dedupKey), 600000);

  // Run graph
  const graph = buildWaastaGraph();

  try {
    const result = await graph.invoke({
      transcript,
      incident_id: incident.id,
    });

    const lm = result.landmark_match;
    console.log('[11LABS-TOOL] Graph done → status:', result.status, 'landmark:', lm?.name);

    return NextResponse.json({
      message: `Edhi Foundation ko ${lm?.name || landmark} ke liye notify kar diya gaya hai. Rescue team aa rahi hai.`,
      incident_id: incident.id,
      landmark: lm?.name || landmark,
      status: result.status,
    });
  } catch (err) {
    console.error('[11LABS-TOOL] Graph error:', err);
    return NextResponse.json({
      message: `Aapki emergency record ho gayi hai. Edhi Foundation ko contact kiya ja raha hai.`,
      incident_id: incident.id,
    });
  }
}

function validateType(type: string): string {
  const valid = ['accident', 'fire', 'medical', 'crime', 'other'];
  return valid.includes(type) ? type : 'medical';
}
