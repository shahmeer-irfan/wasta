import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const dynamic = 'force-dynamic';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a Karachi emergency call parser. Your ONLY job is to extract structured data from emergency transcripts.

INPUT: A transcript from a civilian emergency call (may be in English, Urdu, or Roman Urdu).
OUTPUT: A JSON object with exactly these fields. NO other text, NO markdown, NO explanation.

FIELDS:
- incident_type: EXACTLY one of: "accident", "fire", "medical", "crime", "other"
- summary: 1 sentence in Roman Urdu describing what happened. Use caller's own words. Do NOT add details the caller did not mention.
- severity: Integer 1-5. Judge from context:
  1 = minor (small cut, no urgency)
  2 = moderate (pain, minor wound)
  3 = serious (bleeding, cannot walk) — USE THIS IF UNSURE
  4 = critical (unconscious, heavy bleeding, trapped, multiple victims)
  5 = life-threatening (not breathing, major fire with people inside, active shooting)
- landmark: The location name the caller mentioned. Use EXACT words from transcript. If caller said "Nipa" write "Nipa". If caller said "near my house on Tariq Road" write "Tariq Road". If NO location mentioned, write null.

RULES:
- Output ONLY valid JSON. No backticks, no "json" prefix.
- Do NOT hallucinate locations. If caller did not mention a place, landmark must be null.
- Do NOT change the caller's words in summary. Transliterate, don't translate or embellish.
- If transcript is unclear, use incident_type="medical" and severity=3 as defaults.
- If caller mentions fire, ALWAYS set incident_type="fire" and severity >= 4.
- If caller mentions blood/bleeding, severity >= 3.
- If caller mentions not breathing/behosh/unconscious, severity >= 4.

EXAMPLES:
Input: "Bhai Nipa pe accident hua hai ambulance bhejo khoon nikal raha hai"
Output: {"incident_type":"accident","summary":"Nipa pe accident, khoon nikal raha hai, ambulance chahiye","severity":4,"landmark":"Nipa"}

Input: "Lucky One Mall ke paas aag lagi hai"
Output: {"incident_type":"fire","summary":"Lucky One Mall ke paas aag lagi hai","severity":4,"landmark":"Lucky One Mall"}

Input: "help me please my father fell down"
Output: {"incident_type":"medical","summary":"Father gir gaya hai, help chahiye","severity":3,"landmark":null}

Input: "mujhe Edhi se connect karo"
Output: {"incident_type":"other","summary":"Caller ne Edhi se connect hone ko kaha","severity":3,"landmark":null}`;

export async function POST(req: NextRequest) {
  const { transcript } = await req.json();

  if (!transcript?.trim()) {
    return NextResponse.json({
      incident_type: 'other',
      summary: 'Empty transcript',
      severity: 3,
      landmark: null,
      lat: null, lng: null, zone: null,
    });
  }

  console.log('[PARSE] Transcript:', transcript.substring(0, 100));

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      temperature: 0.05,  // Near-zero for maximum determinism
      max_tokens: 200,
      top_p: 0.9,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    console.log('[PARSE] Raw LLM output:', raw.substring(0, 200));

    // Extract JSON from response (handle markdown wrappers)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and clamp
    const validTypes = ['accident', 'fire', 'medical', 'crime', 'other'];
    const incident_type = validTypes.includes(parsed.incident_type) ? parsed.incident_type : 'medical';
    const severity = Math.min(5, Math.max(1, Number(parsed.severity) || 3));

    const result = {
      incident_type,
      summary: (parsed.summary || transcript.substring(0, 100)).substring(0, 200),
      severity,
      landmark: parsed.landmark || null,
      lat: null,
      lng: null,
      zone: null,
    };

    console.log('[PARSE] Result:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error('[PARSE] Failed:', err);

    // Keyword-based fallback — no LLM needed
    const lower = transcript.toLowerCase();
    const incident_type = lower.includes('fire') || lower.includes('aag') ? 'fire'
      : lower.includes('accident') || lower.includes('takra') || lower.includes('crash') ? 'accident'
      : lower.includes('chori') || lower.includes('snatch') || lower.includes('robbery') || lower.includes('crime') ? 'crime'
      : 'medical';

    const severity = lower.includes('fire') || lower.includes('aag') ? 4
      : lower.includes('khoon') || lower.includes('blood') || lower.includes('behosh') ? 4
      : 3;

    return NextResponse.json({
      incident_type,
      summary: transcript.substring(0, 150),
      severity,
      landmark: null,
      lat: null, lng: null, zone: null,
    });
  }
}
