import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio, getAIResponse, injectToolResult } from '@/lib/voice-ai';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

// Track sessions → incidents
const sessionIncidentMap = new Map<string, string>();
// Track sessions that are on hold (institution busy)
const sessionOnHold = new Set<string>();

// Hold messages — AI will cycle through these to keep civilian engaged
const HOLD_MESSAGES = [
  'Aapki emergency record ho gayi hai. Rescue team ko notify kiya ja raha hai. Please line pe rahein.',
  'Humari team abhi ek aur emergency handle kar rahi hai. Aap ka number agla hai. Fikar mat karein.',
  'Aap safe hain? Koi aur zakhmi toh nahi? Madad aa rahi hai, thoda intezaar karein.',
  'Rescue team jaldi aapko connect karegi. Please hold karein.',
  'Aapki call queue mein hai. Boht jaldi aapko attend kiya jayega.',
];

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get('audio') as File | null;
  const sessionId = (formData.get('sessionId') as string) || 'default';
  const textInput = formData.get('text') as string | null;
  const lat = parseFloat((formData.get('lat') as string) || '0') || null;
  const lng = parseFloat((formData.get('lng') as string) || '0') || null;

  console.log('[VOICE-CHAT] Session:', sessionId, 'hasAudio:', !!audioFile, 'hasText:', !!textInput);

  let userText = textInput || '';

  // Transcribe audio
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

  // If session is on hold, keep civilian engaged
  if (sessionOnHold.has(sessionId)) {
    const existingId = sessionIncidentMap.get(sessionId) || null;
    const supabase = createServiceClient();

    // Check if institution has accepted this incident
    if (existingId) {
      const { data: inc } = await supabase
        .from('incidents')
        .select('status')
        .eq('id', existingId)
        .single();

      if (inc && inc.status === 'accepted') {
        // Institution accepted! Remove from hold
        sessionOnHold.delete(sessionId);
        return NextResponse.json({
          text: 'Aapki call ab rescue team se connect ho rahi hai. Shukriya intezaar karne ka.',
          transcript: userText,
          toolCall: null,
          incident_id: existingId,
          accepted: true,
        });
      }
    }

    // Still on hold — send a reassuring message
    const holdMsg = HOLD_MESSAGES[Math.floor(Math.random() * HOLD_MESSAGES.length)];
    return NextResponse.json({
      text: holdMsg,
      transcript: userText,
      toolCall: null,
      incident_id: existingId,
      onHold: true,
    });
  }

  // If session already has an incident, just continue conversation
  if (sessionIncidentMap.has(sessionId)) {
    const existingId = sessionIncidentMap.get(sessionId)!;
    const { text: aiText } = await getAIResponse(sessionId, userText);
    return NextResponse.json({
      text: aiText,
      transcript: userText,
      toolCall: null,
      incident_id: existingId,
    });
  }

  // Get AI response
  const { text: aiText, toolCall } = await getAIResponse(sessionId, userText);
  let incident_id: string | null = null;

  // Tool call — create incident
  if (toolCall) {
    console.log('[VOICE-CHAT] Tool call:', JSON.stringify(toolCall));
    const supabase = createServiceClient();

    const landmark = (toolCall.landmark as string) || 'GPS Location';
    const incident_type = (toolCall.incident_type as string) || 'medical';
    const severity = Math.min(5, Math.max(1, (toolCall.severity as number) || 3));
    const summary = (toolCall.summary as string) || userText;

    const { data: incident } = await supabase
      .from('incidents')
      .insert({
        transcript: userText, summary, incident_type, severity, landmark,
        status: 'intake',
        ...(lat && lng ? { lat, lng } : {}),
      })
      .select()
      .single();

    if (incident) {
      incident_id = incident.id;
      sessionIncidentMap.set(sessionId, incident.id);
      setTimeout(() => { sessionIncidentMap.delete(sessionId); sessionOnHold.delete(sessionId); }, 600000);

      console.log('[VOICE-CHAT] Incident created:', incident.id);

      // Run LangGraph
      try {
        const graph = buildWaastaGraph();
        const result = await graph.invoke({
          transcript: userText,
          incident_id: incident.id,
        });

        const lm = result.landmark_match;

        // Check if institution is currently busy
        const { data: activeAccepted } = await supabase
          .from('incidents')
          .select('id')
          .in('status', ['accepted', 'en_route'])
          .neq('id', incident.id)
          .limit(1);

        const institutionBusy = (activeAccepted?.length ?? 0) > 0;

        if (institutionBusy) {
          // Institution is busy — put this civilian on hold
          sessionOnHold.add(sessionId);
          console.log('[VOICE-CHAT] Institution busy — civilian on hold');

          const resultMsg = `Aapki emergency ${lm?.name || landmark} pe record ho gayi hai. Rescue team abhi ek aur call pe hai. Aap ka number agla hai — please hold karein.`;
          injectToolResult(sessionId, resultMsg);

          return NextResponse.json({
            text: resultMsg,
            transcript: userText,
            toolCall,
            incident_id,
            status: result.status,
            onHold: true,
          });
        }

        // Institution available — normal flow
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
