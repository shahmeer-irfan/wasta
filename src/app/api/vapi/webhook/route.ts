import { NextRequest, NextResponse } from 'next/server';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

const callIncidentMap = new Map<string, string>();

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message } = body;

  console.log('[WEBHOOK] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[WEBHOOK] Message type:', message?.type);
  console.log('[WEBHOOK] Full body keys:', Object.keys(body));

  if (!message) {
    console.log('[WEBHOOK] No message, returning ok');
    return NextResponse.json({ status: 'ok' });
  }

  const callId = body.call?.id || message.call?.id || '';
  console.log('[WEBHOOK] Call ID:', callId || 'NONE');

  // Handle tool-calls (new format)
  if (message.type === 'tool-calls') {
    console.log('[WEBHOOK] Processing tool-calls, count:', message.toolCalls?.length);
    const results = [];
    for (const call of message.toolCalls || []) {
      console.log('[WEBHOOK] Tool call:', call.function?.name, 'ID:', call.id);
      console.log('[WEBHOOK] Tool args:', JSON.stringify(call.function?.arguments));

      if (call.function?.name === 'report_incident') {
        const args = call.function.arguments || {};
        const result = await handleReportIncident(args, callId);
        console.log('[WEBHOOK] Tool result:', JSON.stringify(result));
        results.push({
          toolCallId: call.id,
          result: JSON.stringify(result),
        });
      } else {
        console.log('[WEBHOOK] Unknown function:', call.function?.name);
        results.push({
          toolCallId: call.id,
          result: JSON.stringify({ status: 'unknown_function' }),
        });
      }
    }
    console.log('[WEBHOOK] Returning results:', results.length);
    return NextResponse.json({ results });
  }

  // Handle function-call (legacy format)
  if (message.type === 'function-call') {
    console.log('[WEBHOOK] Legacy function-call:', message.functionCall?.name);
    console.log('[WEBHOOK] Legacy args:', JSON.stringify(message.functionCall?.parameters));

    if (message.functionCall?.name === 'report_incident') {
      const args = message.functionCall.parameters || {};
      const result = await handleReportIncident(args, callId);
      console.log('[WEBHOOK] Legacy result:', JSON.stringify(result));
      return NextResponse.json({ result: JSON.stringify(result) });
    }
  }

  // Other message types (transcript, end-of-call, etc.)
  console.log('[WEBHOOK] Unhandled type:', message.type);
  return NextResponse.json({ status: 'ok' });
}

async function handleReportIncident(args: Record<string, unknown>, callId: string) {
  console.log('[INCIDENT] ────────────────────────────');
  console.log('[INCIDENT] Args:', JSON.stringify(args));
  console.log('[INCIDENT] Call ID:', callId);

  const supabase = createServiceClient();

  const landmark = (args.landmark as string) || 'Unknown';
  const incident_type = (args.incident_type as string) || 'other';
  const severity = Math.min(5, Math.max(1, (args.severity as number) || 3));
  const summary = (args.summary as string) || '';
  const transcript = (args.transcript as string) || `${incident_type} near ${landmark}`;

  console.log('[INCIDENT] Parsed → type:', incident_type, 'landmark:', landmark, 'severity:', severity);

  // Deduplication
  if (callId && callIncidentMap.has(callId)) {
    const existingId = callIncidentMap.get(callId)!;
    console.log('[INCIDENT] DUPLICATE detected for call', callId, '→ incident', existingId);

    const { data: existing } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', existingId)
      .single();

    if (existing) {
      console.log('[INCIDENT] Returning existing incident, status:', existing.status);
      return {
        success: true,
        incident_id: existing.id,
        landmark: existing.landmark || landmark,
        message: `Aapki emergency ${existing.landmark || landmark} pe pehle se handle ho rahi hai. Rescue team ko notify kar diya gaya hai. Line pe rahein.`,
      };
    }
  }

  // Create incident
  console.log('[INCIDENT] Creating new incident in Supabase...');
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      transcript,
      summary: summary || `${incident_type} reported near ${landmark}`,
      incident_type: validateType(incident_type),
      severity,
      landmark,
      status: 'intake',
    })
    .select()
    .single();

  if (error || !incident) {
    console.error('[INCIDENT] CREATE FAILED:', error?.message || 'no data');
    return { success: false, message: 'System error. Apni emergency dobara describe karein.' };
  }

  console.log('[INCIDENT] Created:', incident.id, 'status:', incident.status);

  // Store for dedup
  if (callId) {
    callIncidentMap.set(callId, incident.id);
    setTimeout(() => callIncidentMap.delete(callId), 600000);
  }

  // Run LangGraph
  console.log('[INCIDENT] Running LangGraph pipeline...');
  const graph = buildWaastaGraph();

  try {
    const result = await graph.invoke({
      transcript,
      incident_id: incident.id,
    });

    console.log('[INCIDENT] Graph completed → status:', result.status);
    console.log('[INCIDENT] Landmark match:', result.landmark_match?.name || 'NONE');
    console.log('[INCIDENT] Broadcast ID:', result.broadcast_id || 'NONE');
    console.log('[INCIDENT] Target institute:', result.target_institute_id || 'NONE');

    const lm = result.landmark_match;
    const resolvedName = lm?.name || landmark;

    return {
      success: true,
      incident_id: incident.id,
      landmark: resolvedName,
      zone: lm?.zone || 'Unknown',
      message: `Edhi Foundation ko ${resolvedName} ke liye notify kar diya gaya hai. Rescue team aaen gi. Aapki call ab transfer ho rahi hai.`,
    };
  } catch (err) {
    console.error('[INCIDENT] GRAPH ERROR:', err);
    return {
      success: true,
      incident_id: incident.id,
      landmark,
      message: `Aapki emergency ${landmark} pe record ho gayi hai. Edhi Foundation ko contact kiya ja raha hai. Line pe rahein.`,
    };
  }
}

function validateType(type: string): string {
  const valid = ['accident', 'fire', 'medical', 'crime', 'other'];
  return valid.includes(type) ? type : 'other';
}
