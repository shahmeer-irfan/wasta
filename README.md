# Waasta - AI Emergency Response Broker for Karachi

Waasta is an AI-powered emergency response orchestration system that connects civilians in distress with the nearest available rescue institute in Karachi. A civilian calls the AI, the AI gathers critical details, routes the emergency to the right institute, and transfers the call -- all in under 30 seconds.

## How It Works

```
CIVILIAN                        AI (Vapi)                       INSTITUTION
   |                               |                                |
   |-- "Speak to Waasta AI" ------>|                                |
   |<-- "What's your emergency?" --|                                |
   |-- "Accident at Nipa..." ----->|                                |
   |                               |-- report_incident() --------->| (webhook -> Supabase)
   |                               |                                | BROADCAST MODAL + RING
   |<-- "Help is being sent..." ---|                                |
   |                               |                                |
   |   [call stays connected]      |              ACCEPT -----------|
   |                               |                                |
   |<-- "Connected to Edhi..." ----|   [incident -> accepted]       |
   |                               |                                |
   |                               |              DISPATCH ----------| <- human clicks
   |                               |                                |
   |<-- live ambulance tracking ---+---- simulation starts -------->| live tracking
```

### The Three Actors

| Actor | Role | Interface |
|-------|------|-----------|
| **Civilian** | Reports emergency via AI voice call, text, or speech-to-text | `/civilian` (mobile-first) |
| **Waasta AI** | Gathers details, geocodes location, finds nearest institute, connects call | Vapi WebRTC + Groq LLM |
| **Institution** | Receives broadcast, accepts emergency, dispatches ambulance | `/institution/dashboard` (desktop) |

### Key Design Decisions

- **AI does NOT dispatch** -- it only gathers info and connects. The human dispatcher at the institution decides when to send an ambulance.
- **Three input modes** for civilians: Vapi AI voice call, browser speech-to-text, or typed text.
- **LangGraph state machine** with HITL (Human-in-the-Loop) checkpoint -- the graph pauses at the `pivot` node waiting for the institution's accept/reject decision.
- **Supabase Realtime** for all live updates -- both civilian and institution see ambulance movement in real-time.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS, Framer Motion, Lucide Icons |
| AI Orchestration | LangGraph.js (5-node state machine) |
| LLM | Groq (Llama 3.3 70B) for transcript parsing |
| Voice | Vapi AI (WebRTC) for civilian-AI conversation |
| Database | Supabase (PostgreSQL + Realtime) |
| Maps | Leaflet.js (CartoDB tiles) |
| State | Zustand |
| UI Components | Radix UI (shadcn/ui) |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # Landing page (route picker)
│   ├── civilian/page.tsx                 # Mobile SOS UI
│   ├── institution/dashboard/page.tsx    # Dispatcher war room
│   └── api/
│       ├── ai/parse-incident/route.ts    # Groq LLM: transcript -> structured data
│       ├── agent/trigger/route.ts        # Start LangGraph pipeline (text input path)
│       ├── agent/respond/route.ts        # HITL: institution accept/reject
│       ├── dispatch/route.ts             # Institution dispatches ambulance
│       ├── demo/trigger/route.ts         # One-click demo (random scenario)
│       ├── simulate/route.ts             # Ambulance movement simulation
│       └── vapi/webhook/route.ts         # Vapi AI tool-call handler
├── components/
│   ├── civilian/
│   │   ├── EmergencyCall.tsx             # Vapi WebRTC voice call component
│   │   ├── SOSButton.tsx                 # Animated SOS trigger
│   │   ├── TranscriptStream.tsx          # Live transcript + AI status badges
│   │   └── TrackingSheet.tsx             # Bottom sheet: ETA, ambulance info, timeline
│   ├── institution/
│   │   └── BroadcastModal.tsx            # Emergency alert modal (accept/reject)
│   └── maps/
│       └── WaastaMap.tsx                 # Leaflet map with custom markers
├── lib/
│   ├── agents/graph.ts                   # LangGraph state machine (5 nodes)
│   ├── supabase/client.ts                # Lazy Supabase client
│   ├── constants.ts                      # Karachi landmarks, severity maps
│   ├── simulation.ts                     # LERP ambulance movement engine
│   ├── store.ts                          # Zustand stores (civilian + institution)
│   └── utils.ts                          # cn() helper
└── types/index.ts                        # All TypeScript interfaces
```

---

## LangGraph Pipeline

5-node state machine in `src/lib/agents/graph.ts`:

```
START -> intake -> geocoding -> broker -> pivot -> patch -> END
                                  ^         |
                                  |_REJECT__|  (loops to find next institute)
```

| Node | What It Does |
|------|-------------|
| **intake** | Sends transcript to Groq LLM -> extracts `incident_type`, `summary`, `severity`, `landmark` |
| **geocoding** | Fuzzy-matches landmark against 10 Karachi locations -> resolves to `[lat, lng]` |
| **broker** | Queries Supabase for nearest available institute by type -> creates broadcast record |
| **pivot** | HITL checkpoint -- execution PAUSES. Resumes on institution ACCEPT/REJECT via `/api/agent/respond` |
| **patch** | Assigns nearest available resource from accepted institute -> marks dispatched |

---

## Database Schema

5 tables in Supabase (`supabase/schema.sql`):

| Table | Purpose |
|-------|---------|
| `institutes` | Rescue orgs (Edhi, Chhipa, Aman, KFD, Rescue 1122) |
| `resources` | Vehicles (ambulances, fire trucks) with live lat/lng |
| `incidents` | Each emergency with full lifecycle tracking |
| `incident_broadcasts` | HITL handshake records (pending -> accepted/rejected) |
| `call_logs` | Voice session records |

### Seeded Data

- 5 Karachi rescue institutes
- 3 ambulances per ambulance institute, 2 fire trucks per fire station
- 10 Karachi landmarks for geocoding

---

## Karachi Landmarks (Geocoding)

| Landmark | Zone | Coordinates |
|----------|------|------------|
| Moti Mahal | Gulshan | 24.9204, 67.0932 |
| Lucky One Mall | FB Area | 24.9312, 67.0901 |
| Do Darya | DHA | 24.7981, 67.0645 |
| Nipa Chowrangi | Gulshan | 24.9175, 67.0972 |
| Nursery | PECHS | 24.8615, 67.0542 |
| Clifton Bridge | Clifton | 24.8206, 67.0305 |
| Tariq Road | PECHS | 24.8690, 67.0649 |
| Saddar | Saddar | 24.8607, 67.0100 |
| Korangi Crossing | Korangi | 24.8320, 67.1270 |
| North Nazimabad | North Nazimabad | 24.9420, 67.0350 |

---

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/parse-incident` | POST | Groq LLM parses transcript into structured incident data |
| `/api/agent/trigger` | POST | Creates incident + runs LangGraph pipeline (text/demo path) |
| `/api/agent/respond` | POST | Institution accepts/rejects broadcast (HITL resume) |
| `/api/dispatch` | POST | Institution dispatches ambulance (assigns resource + simulation) |
| `/api/demo/trigger` | POST | One-click demo with random Karachi emergency scenario |
| `/api/simulate` | POST | LERP ambulance movement simulation (25 steps, 2s each) |
| `/api/vapi/webhook` | POST | Vapi tool-call handler (creates incident from voice conversation) |

---

## Incident Lifecycle

```
intake -> geocoded -> broadcasting -> accepted -> dispatched -> resolved
                        |                ^
                        |   REJECT       |
                        +-> (next inst) -+
```

| Status | Trigger | What Happens |
|--------|---------|-------------|
| `intake` | Civilian submits / AI calls tool | Groq LLM parses transcript |
| `geocoded` | Landmark matched | Location resolved to coordinates |
| `broadcasting` | Institute found | Broadcast sent, institution dashboard rings |
| `accepted` | Institution clicks ACCEPT | Civilian notified, Dispatch button appears |
| `dispatched` | Institution clicks DISPATCH AMBULANCE | Resource assigned, simulation starts |
| `resolved` | Manual | Incident closed |

---

## Simulation Engine

`src/lib/simulation.ts` -- LERP-based ambulance movement:

- **Steps**: 25 increments
- **Interval**: 2000ms per step
- **Total**: ~50 seconds transit time
- **Updates**: Writes `lat/lng` to Supabase `resources` table each tick
- **Realtime**: Both maps update via Supabase Realtime subscriptions
- **Status**: `dispatched` -> `en_route` -> `on_scene`

---

## Setup

### 1. Install

```bash
cd guardian
npm install --legacy-peer-deps
```

### 2. Supabase

1. Create a Supabase project
2. Run `supabase/schema.sql` in the SQL Editor
3. Enable Realtime for: `incidents`, `incident_broadcasts`, `resources`

### 3. Environment Variables

`.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000

GROQ_API_KEY=your_groq_api_key

NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key
NEXT_PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id
VAPI_SERVER_SECRET=your_vapi_server_secret
```

### 4. Vapi Assistant

In the Vapi dashboard:
- Add tool `report_incident` with params: `landmark`, `incident_type`, `severity`, `summary`, `transcript`
- Set Server URL to `https://your-domain/api/vapi/webhook` (use `npx ngrok http 3000` for local)
- Configure system prompt (see Vapi prompt docs in project)

### 5. Run

```bash
npm run dev
```

| Page | URL |
|------|-----|
| Landing | http://localhost:3000 |
| Civilian SOS | http://localhost:3000/civilian |
| Institution Dashboard | http://localhost:3000/institution/dashboard |

---

## Demo Mode

Click **Demo** (bottom of civilian page) to trigger a random emergency without Vapi. Uses Groq AI + full LangGraph pipeline.

5 scenarios (Roman Urdu):
- Road accident at Nipa Chowrangi
- Medical emergency at Moti Mahal
- Bike accident near Lucky One Mall
- Snatching incident at Do Darya
- Building fire near Nursery

---

## Zustand Stores

### WaastaStore (Civilian)
```
agentStatus: idle | listening | analyzing | broadcasting | accepted | dispatched
transcript, incidentId, incident, assignedResource, eta
```

### InstitutionStore
```
activeBroadcast (with nested incident data)
incidents[]
```

---

## Key Files to Modify

| To change... | Edit |
|-------------|------|
| AI conversation behavior | Vapi dashboard system prompt |
| Karachi landmarks | `src/lib/constants.ts` |
| Transcript parsing | `src/app/api/ai/parse-incident/route.ts` |
| Dispatch logic | `src/app/api/dispatch/route.ts` |
| Simulation speed | `src/lib/simulation.ts` (intervalMs, steps) |
| Map appearance | `src/components/maps/WaastaMap.tsx` |
| Civilian UI | `src/app/civilian/page.tsx` |
| Institution UI | `src/app/institution/dashboard/page.tsx` |
| Database schema | `supabase/schema.sql` |
