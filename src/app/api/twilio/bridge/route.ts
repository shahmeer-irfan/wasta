import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { caller_phone, institute_phone, incident_id } = await req.json();

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const supabase = createServiceClient();

  try {
    // Create a conference call to bridge civilian → institute
    const call = await client.calls.create({
      to: institute_phone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      twiml: `<Response><Say voice="alice">Guardian Emergency: Incoming emergency call being patched through.</Say><Dial>${caller_phone}</Dial></Response>`,
    });

    // Log the call
    await supabase.from('call_logs').insert({
      incident_id,
      caller_phone,
      institute_phone,
      twilio_sid: call.sid,
      status: 'initiated',
    });

    return NextResponse.json({ sid: call.sid, status: 'initiated' });
  } catch (err) {
    await supabase.from('call_logs').insert({
      incident_id,
      caller_phone,
      institute_phone,
      status: 'failed',
    });

    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
