import { NextResponse } from 'next/server';
import { buildWaastaGraph } from '@/lib/agents/graph';
import { createServiceClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

const DEMO_SCENARIOS = [
  "Bhai sahab Nipa Chowrangi pe bohot bura accident ho gaya hai! Do gariyan takra gayi hain aur ek aadmi ka khoon nikal raha hai. Jaldi ambulance bhejo!",
  "Moti Mahal ke saamne ek budha aadmi gir gaya hai, usse saans nahi aa rahi, medical emergency hai please jaldi madad bhejo!",
  "Lucky One Mall ke paas road pe ek bike aur car ka accident hua hai, rider zakhmi hai aur khoon nikal raha hai, ambulance chahiye urgent!",
  "Do Darya ke raaste pe ek aurat ko snatcher ne bag cheena aur dhakka diya, woh gir gayi hai bohot zakhmi hai, please koi bhejo jaldi!",
  "Nursery ke paas ek building mein aag lag gayi hai, dhuaan nikal raha hai, log andar phansey hain, fire brigade ko bulao please!",
];

export async function POST() {
  const transcript = DEMO_SCENARIOS[Math.floor(Math.random() * DEMO_SCENARIOS.length)];
  const supabase = createServiceClient();

  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({ transcript, status: 'intake' })
    .select()
    .single();

  if (error || !incident) {
    return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
  }

  const graph = buildWaastaGraph();

  try {
    const result = await graph.invoke({
      transcript,
      incident_id: incident.id,
    });

    return NextResponse.json({
      incident_id: incident.id,
      status: result.status,
      broadcast_id: result.broadcast_id || null,
      landmark: result.landmark_match?.name || null,
      transcript,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
