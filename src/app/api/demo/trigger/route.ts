import { NextResponse } from 'next/server';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

const DEMO_SCENARIOS = [
  {
    transcript: "Bhai sahab Nipa Chowrangi pe bohot bura accident ho gaya hai! Do gariyan takra gayi hain aur ek aadmi ka khoon nikal raha hai. Jaldi ambulance bhejo!",
    caller_phone: '+92-300-1234567',
  },
  {
    transcript: "Moti Mahal ke saamne ek budha aadmi gir gaya hai, usse saans nahi aa rahi, medical emergency hai please jaldi madad bhejo!",
    caller_phone: '+92-312-9876543',
  },
  {
    transcript: "Lucky One Mall ke paas road pe ek bike aur car ka accident hua hai, rider zakhmi hai aur khoon nikal raha hai, ambulance chahiye urgent!",
    caller_phone: '+92-321-5551234',
  },
  {
    transcript: "Do Darya ke raaste pe ek aurat ko snatcher ne bag cheena aur dhakka diya, woh gir gayi hai bohot zakhmi hai, please koi bhejo jaldi!",
    caller_phone: '+92-333-7774567',
  },
  {
    transcript: "Nursery ke paas ek building mein aag lag gayi hai, dhuaan nikal raha hai, log andar phansey hain, fire brigade ko bulao please!",
    caller_phone: '+92-345-1112233',
  },
];

export async function POST() {
  const scenario = DEMO_SCENARIOS[Math.floor(Math.random() * DEMO_SCENARIOS.length)];
  const supabase = createServiceClient();

  // Create incident
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      caller_phone: scenario.caller_phone,
      transcript: scenario.transcript,
      status: 'intake',
    })
    .select()
    .single();

  if (error || !incident) {
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }

  // Run LangGraph (pauses at pivot)
  const graph = buildWaastaGraph();

  try {
    const result = await graph.invoke({
      transcript: scenario.transcript,
      caller_phone: scenario.caller_phone,
      incident_id: incident.id,
    });

    return NextResponse.json({
      incident_id: incident.id,
      status: result.status,
      broadcast_id: result.broadcast_id,
      landmark: result.landmark_match?.name,
      lat: result.incident_card?.lat,
      lng: result.incident_card?.lng,
      transcript: scenario.transcript,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
