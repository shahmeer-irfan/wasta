import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Edge TTS — free Microsoft TTS
// Voice: ur-PK-AsadNeural (Urdu male) or ur-PK-UzmaNeural (Urdu female)
const VOICE = 'ur-PK-AsadNeural';

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text?.trim()) {
    return new NextResponse(null, { status: 400 });
  }

  console.log('[TTS] Generating speech for:', text.substring(0, 80));

  try {
    // Use edge-tts via command line (it's a Python package, but we can use the HTTP approach)
    // Alternative: use Groq's TTS or a simple Web Speech API on client side
    // For now, return the text and let the client use browser TTS
    return NextResponse.json({ text, voice: VOICE });
  } catch (err) {
    console.error('[TTS] Failed:', err);
    return NextResponse.json({ text, voice: VOICE });
  }
}
