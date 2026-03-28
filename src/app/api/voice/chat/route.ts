import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio, getAIResponse, injectToolResult } from '@/lib/voice-ai';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// Track which sessions already created incidents — prevents duplicates
const sessionIncidentMap = new Map<string, string>();

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get('audio') as File | null;
  const sessionId = (formData.get('sessionId') as string) || 'default';
  const textInput = formData.get('text') as string | null;
  const lat = parseFloat((formData.get('lat') as string) || '0') || null;
  const lng = parseFloat((formData.get('lng') as string) || '0') || null;

  console.log('[VOICE-CHAT] ━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[VOICE-CHAT] Session:', sessionId, 'hasAudio:', !!audioFile, 'hasText:', !!textInput);

  let userText = textInput || '';

  // Step 1: Transcribe audio if provided
  if (audioFile && !userText) {
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    userText = await transcribeAudio(buffer);
  }

  if (!userText) {
    return NextResponse.json({
      text: 'Kya hua hai? Batayein.',
      transcript: '',
      toolCall: null,
      incident_id: null,
    });
  }

  console.log('[VOICE-CHAT] User said:', userText);

  // Check if this session already created an incident
  if (sessionIncidentMap.has(sessionId)) {
    const existingId = sessionIncidentMap.get(sessionId)!;
    console.log('[VOICE-CHAT] Session already has incident:', existingId.substring(0, 8));

    // Just continue conversation, no new incident
    const { text: aiText } = await getAIResponse(sessionId, userText);

    return NextResponse.json({
      text: aiText,
      transcript: userText,
      toolCall: null,
      incident_id: existingId,
    });
  }

  // Step 2: Get AI response
  const { text: aiText, toolCall } = await getAIResponse(sessionId, userText);

  let incident_id: string | null = null;

  // Step 3: If tool was called AND no incident exists for this session
  if (toolCall) {
    console.log('[VOICE-CHAT] Tool call detected:', JSON.stringify(toolCall));

    const supabase = createServiceClient();

    const landmark = (toolCall.landmark as string) || 'GPS Location';
    const incident_type = (toolCall.incident_type as string) || 'medical';
    const severity = Math.min(5, Math.max(1, (toolCall.severity as number) || 3));
    const summary = (toolCall.summary as string) || userText;

    // Create incident with GPS coords
    const { data: incident } = await supabase
      .from('incidents')
      .insert({
        transcript: userText,
        summary,
        incident_type,
        severity,
        landmark,
        status: 'intake',
        ...(lat && lng ? { lat, lng } : {}),
      })
      .select()
      .single();

    if (incident) {
      incident_id = incident.id;
      // Store session → incident mapping to prevent duplicates
      sessionIncidentMap.set(sessionId, incident.id);
      setTimeout(() => sessionIncidentMap.delete(sessionId), 600000); // cleanup after 10 min

      console.log('[VOICE-CHAT] Incident created:', incident.id, '(session locked)');

      // Run LangGraph
      try {
        const graph = buildWaastaGraph();
        const result = await graph.invoke({
          transcript: userText,
          incident_id: incident.id,
        });

        const lm = result.landmark_match;
        const resultMsg = `Edhi Foundation ko ${lm?.name || landmark} ke liye notify kar diya. Rescue team aa rahi hai.`;

        injectToolResult(sessionId, resultMsg);

        return NextResponse.json({
          text: `${aiText} ${resultMsg} Aapki call rescue team ko transfer ho rahi hai.`,
          transcript: userText,
          toolCall,
          incident_id,
          status: result.status,
        });
      } catch (err) {
        console.error('[VOICE-CHAT] Graph error:', err);
        const fallbackMsg = 'Emergency record ho gayi hai. Edhi Foundation ko contact kiya ja raha hai.';
        injectToolResult(sessionId, fallbackMsg);

        return NextResponse.json({
          text: `${aiText} ${fallbackMsg}`,
          transcript: userText,
          toolCall,
          incident_id,
        });
      }
    }
  }

  return NextResponse.json({
    text: aiText,
    transcript: userText,
    toolCall: null,
    incident_id,
  });
}
