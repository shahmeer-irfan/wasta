// ============================================================
// WAASTA — Voice AI Pipeline
// Whisper (Groq) → LLM (Groq) → Edge TTS → Audio
// Fully free, no paid APIs
// ============================================================

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Conversation state per session
interface ConversationState {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  incidentReported: boolean;
  toolResult: string | null;
}

const sessions = new Map<string, ConversationState>();

const SYSTEM_PROMPT = `Tu Waasta hai — Karachi ka emergency dispatcher.

## TERA KAAM
Caller SIRF batayega KYA HUA. Tu sun ke samajh aur TURANT tool call kar.
Location POOCHNI NAHI — system GPS se khud detect karta hai. Landmark hamesha "GPS Location" likh.

## FLOW
1. Caller kuch bole → samajh kya hua (accident/fire/medical/crime).
2. Samajh aa gaya → TURANT tool call kar. Kuch aur mat pooch.
3. Samajh NAHI aaya → SIRF bol: "Kya hua hai batayein?" — bas yeh EK sawaal.
4. Jawab mile → TURANT tool call kar.
5. Tool result aaye → wohi padh ke sunao.
6. Bol: "Rescue team ko bhej diya hai."
7. CHUP. Ek lafz aur nahi.

## ZAROORI RULES
- Location KABHI mat pooch. KABHI NAHI. GPS se automatic hai.
- landmark field mein HAMESHA "GPS Location" likh.
- MAXIMUM 1 sawaal poori call mein.
- Har jawab 10 alfaaz se kam.
- Fire/aag sune → 0 sawaal, TURANT tool call, severity 4.
- Rona/cheekh sune → "Madad bhej raha hoon" → TURANT tool call, severity 4.
- "Kahan hain?" ya "Location batayein?" KABHI mat bol. MANA HAI.
- Naam, phone, CNIC mat pooch.
- Tool ke baad koi follow-up nahi. Chup.

## SEVERITY
3 = default (agar pata na ho)
4 = khoon/behosh/multiple zakhmi
5 = saans band/badi aag/goli

## TOOL CALL FORMAT
Jab ready ho, apne jawab mein EXACTLY yeh likh:
[TOOL_CALL:report_incident]{"incident_type":"TYPE","landmark":"GPS Location","severity":NUMBER,"summary":"CALLER KE ALFAAZ"}[/TOOL_CALL]

incident_type: "accident" ya "fire" ya "medical" ya "crime" ya "other"
landmark: HAMESHA "GPS Location"
severity: 3 default, 4 serious, 5 life-threatening
summary: SIRF caller ke alfaaz Roman Urdu mein. Nayi info mat daal.

## EXAMPLES

Caller: "Accident ho gaya hai bhai"
→ [TOOL_CALL:report_incident]{"incident_type":"accident","landmark":"GPS Location","severity":3,"summary":"Accident ho gaya hai"}[/TOOL_CALL]

Caller: "Aag lagi hai!"
→ [TOOL_CALL:report_incident]{"incident_type":"fire","landmark":"GPS Location","severity":4,"summary":"Aag lagi hai"}[/TOOL_CALL]

Caller: "Mere abbu behosh ho gaye"
→ [TOOL_CALL:report_incident]{"incident_type":"medical","landmark":"GPS Location","severity":4,"summary":"Buzurg behosh ho gaye"}[/TOOL_CALL]

Caller: (unclear mumbling)
→ "Kya hua hai batayein?"
→ Caller: "Gari ka accident"
→ [TOOL_CALL:report_incident]{"incident_type":"accident","landmark":"GPS Location","severity":3,"summary":"Gari ka accident"}[/TOOL_CALL]

Caller: "Edhi se milao"
→ [TOOL_CALL:report_incident]{"incident_type":"other","landmark":"GPS Location","severity":3,"summary":"DIRECT CONNECT: Edhi Foundation"}[/TOOL_CALL]`;

export function getOrCreateSession(sessionId: string): ConversationState {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      incidentReported: false,
      toolResult: null,
    });
    // Auto-cleanup after 10 min
    setTimeout(() => sessions.delete(sessionId), 600000);
  }
  return sessions.get(sessionId)!;
}

// Step 1: Transcribe audio using Groq Whisper
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    const uint8 = new Uint8Array(audioBuffer);
    const file = new File([uint8], 'audio.webm', { type: 'audio/webm' });

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'ur', // Urdu
      response_format: 'text',
    });

    const text = typeof transcription === 'string' ? transcription : (transcription as { text?: string }).text || '';
    console.log('[VOICE-AI] Transcribed:', text.substring(0, 100));
    return text.trim();
  } catch (err) {
    console.error('[VOICE-AI] Transcription failed:', err);
    return '';
  }
}

// Step 2: Get AI response using Groq LLM
export async function getAIResponse(
  sessionId: string,
  userText: string
): Promise<{ text: string; toolCall: Record<string, unknown> | null }> {
  const state = getOrCreateSession(sessionId);

  state.messages.push({ role: 'user', content: userText });

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: state.messages,
      temperature: 0.1,
      max_tokens: 150,
    });

    const response = completion.choices[0]?.message?.content || '';
    console.log('[VOICE-AI] AI response:', response.substring(0, 100));

    // Check for tool call in response
    const toolMatch = response.match(/\[TOOL_CALL:report_incident\]([\s\S]*?)\[\/TOOL_CALL\]/);
    let toolCall: Record<string, unknown> | null = null;
    let cleanText = response;

    if (toolMatch) {
      try {
        toolCall = JSON.parse(toolMatch[1]);
        // Remove tool call from spoken text
        cleanText = response.replace(/\[TOOL_CALL:[\s\S]*?\[\/TOOL_CALL\]/, '').trim();
        state.incidentReported = true;
      } catch {
        console.error('[VOICE-AI] Failed to parse tool call');
      }
    }

    // If tool result was injected, the AI should read it
    if (!cleanText && state.toolResult) {
      cleanText = state.toolResult;
      state.toolResult = null;
    }

    state.messages.push({ role: 'assistant', content: response });

    return { text: cleanText || 'Madad aa rahi hai.', toolCall };
  } catch (err) {
    console.error('[VOICE-AI] LLM failed:', err);
    return { text: 'System mein masla hai. 1122 call karein.', toolCall: null };
  }
}

// Step 3: Inject tool result back into conversation
export function injectToolResult(sessionId: string, result: string): void {
  const state = getOrCreateSession(sessionId);
  state.toolResult = result;
  state.messages.push({
    role: 'assistant',
    content: `Tool result: ${result}. Ab yeh caller ko sunao aur bol "Aapki call rescue team ko transfer ho rahi hai."`,
  });
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
