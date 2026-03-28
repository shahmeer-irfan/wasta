import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { transcript } = await req.json();
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are an emergency call analyzer for Karachi, Pakistan. Parse the transcript and extract:
- incident_type: one of "accident", "fire", "medical", "crime", "other"
- summary: 1-2 sentence summary in Roman Urdu (transliterated Urdu using English letters)
- severity: 1-5 (1=low, 5=life-threatening)
- landmark: the nearest landmark or location mentioned (keep original name)

Respond ONLY with valid JSON. No markdown, no explanation.
Example: {"incident_type":"accident","summary":"Nipa Chowrangi ke paas gari ka accident hua hai, 2 log zakhmi hain","severity":4,"landmark":"Nipa Chowrangi"}`,
      },
      { role: 'user', content: transcript },
    ],
    temperature: 0.1,
    max_tokens: 300,
  });

  const text = completion.choices[0]?.message?.content ?? '{}';

  try {
    const parsed = JSON.parse(text);
    return NextResponse.json({
      incident_type: parsed.incident_type || 'other',
      summary: parsed.summary || 'Emergency reported',
      severity: Math.min(5, Math.max(1, parsed.severity || 3)),
      landmark: parsed.landmark || null,
      lat: null,
      lng: null,
      zone: null,
    });
  } catch {
    return NextResponse.json({
      incident_type: 'other',
      summary: 'Emergency call received — manual review needed',
      severity: 3,
      landmark: null,
      lat: null,
      lng: null,
      zone: null,
    });
  }
}
