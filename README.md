# Waasta — AI Emergency Response System for Karachi

> Multi-agent AI system that connects civilians to rescue services through voice AI, real-time dispatch, and live ambulance tracking.

Built for AI Mustaqbil 2.0 — a production-grade emergency response broker powered by LangGraph orchestration, Groq Whisper STT, and WebRTC voice communication.

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   CIVILIAN APP   │     │   AI PIPELINE    │     │  INSTITUTION WAR │
│   (Mobile-first) │     │  (Multi-Agent)   │     │      ROOM        │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ • SOS Button     │────►│ • Whisper STT    │────►│ • Broadcast Modal│
│ • Voice AI Call  │     │ • Groq LLM Parse │     │ • Accept/Reject  │
│ • Text Input     │     │ • LangGraph Flow │     │ • Voice Chat     │
│ • Live Map       │     │ • OSRM Routing   │     │ • Dispatch Button│
│ • Route Tracking │◄───►│ • Simulation     │◄───►│ • Live Tracking  │
│ • WebRTC Voice   │     │ • Supabase RT    │     │ • Queue System   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

---

## Multi-Agent Orchestration (LangGraph)

The core AI pipeline is a **5-node LangGraph state machine** that processes each emergency:

```
START ──► INTAKE ──► GEOCODE ──► BROKER ──► PIVOT (HITL) ──► PATCH ──► END
                                    ▲            │
                                    └── REJECT ──┘  (loops to find next institute)
```

| Agent Node | Role | Technology |
|------------|------|-----------|
| **Intake Agent** | Parses emergency transcript into structured data (type, severity, landmark) | Groq Llama 3.3 70B |
| **Geocode Agent** | Matches caller's location words to 10+ Karachi landmarks with fuzzy scoring | Custom fuzzy matcher + GPS fallback |
| **Broker Agent** | Finds nearest available rescue institute using haversine distance | Supabase query + distance calc |
| **Pivot Agent** | HITL checkpoint — pauses graph, waits for human accept/reject | Supabase Realtime |
| **Patch Agent** | Confirms acceptance, marks incident dispatched | Supabase update |

### Agent State

```typescript
{
  transcript: string,           // Raw emergency description
  incident_id: string,          // Supabase incident UUID
  incident_card: IncidentCard,  // Parsed: type, severity, landmark, summary
  landmark_match: LandmarkData, // Geocoded: lat, lng, zone
  broadcast_id: string,         // HITL handshake record
  target_institute_id: string,  // Selected institute
  exclude_list: string[],       // Rejected institutes (for retry loop)
  pivot_decision: 'ACCEPT' | 'REJECT' | '',
  status: string,               // Current pipeline stage
}
```

---

## Voice AI Pipeline (100% Free)

Custom-built voice conversation system — no paid voice APIs:

```
Browser Microphone (8s chunks)
        │
        ▼
  /api/voice/chat (POST audio blob)
        │
        ▼
  Groq Whisper large-v3 (STT — Urdu/Hindi)
        │
        ▼
  Groq Llama 3.3 70B (Conversational AI)
        │
        ├── Tool call detected? ──► Create incident + Run LangGraph
        │
        ▼
  Browser SpeechSynthesis (TTS — Urdu voice, ur-PK)
        │
        ▼
  Speaker plays response ──► Auto-records next turn
```

**Cost: $0** — Uses Groq free tier for STT + LLM, browser built-in TTS.

---

## Real-Time Features

### WebRTC Voice Chat (Civilian ↔ Institution)
- Browser-to-browser audio via RTCPeerConnection
- Supabase Realtime broadcast channels for WebRTC signaling (SDP offer/answer + ICE candidates)
- Auto-connects when institution accepts the broadcast
- Hangup propagation — ending on one side ends both

### OSRM Road Routing
- Real Karachi road routes via OSRM public server (free, no API key)
- 50-200 waypoints per route stored in Supabase
- Client-driven simulation: dashboard polls `/api/simulate/step` every 2s
- Both maps show: gray route line (planned) + orange progress line (covered)

### Broadcast Queue
- Multiple simultaneous calls handled via queue system
- First call shows popup immediately
- Subsequent calls queued with pulsing "X Waiting" indicator
- Queue auto-promotes next call when current one is resolved

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 14 (App Router), TypeScript | Full-stack web app |
| **Styling** | Tailwind CSS, Framer Motion | UI + animations |
| **AI Orchestration** | LangGraph.js | Multi-agent state machine |
| **LLM** | Groq (Llama 3.3 70B) | Transcript parsing + conversation |
| **STT** | Groq Whisper large-v3 | Voice-to-text (Urdu) |
| **TTS** | Browser SpeechSynthesis | Text-to-voice (free) |
| **Database** | Supabase (PostgreSQL + Realtime) | Persistence + live subscriptions |
| **Maps** | MapLibre GL (CartoDB Voyager tiles) | Interactive maps |
| **Routing** | OSRM (public, free) | Real road route calculation |
| **Voice** | WebRTC + Supabase Broadcast | Browser-to-browser voice chat |
| **State** | Zustand | Client state management |
| **UI Components** | Radix UI (shadcn/ui) | Accessible primitives |
| **Icons** | Lucide React | SVG icons |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # Landing page
│   ├── civilian/page.tsx                 # Mobile SOS UI
│   ├── institution/dashboard/page.tsx    # Dispatcher war room
│   └── api/
│       ├── ai/parse-incident/            # Groq LLM transcript parser
│       ├── agent/trigger/                # Start LangGraph pipeline
│       ├── agent/respond/                # HITL accept/reject
│       ├── dispatch/                     # Assign ambulance + OSRM route
│       ├── simulate/step/                # Advance ambulance one waypoint
│       ├── voice/chat/                   # Whisper STT + LLM conversation
│       ├── voice/tts/                    # TTS helper
│       ├── demo/trigger/                 # One-click demo scenario
│       ├── vapi/webhook/                 # Vapi AI webhook (legacy)
│       └── elevenlabs/tool/              # ElevenLabs tool handler (legacy)
├── components/
│   ├── civilian/
│   │   ├── EmergencyCall.tsx             # Voice AI call component
│   │   ├── SOSButton.tsx                 # Animated SOS trigger
│   │   ├── TranscriptStream.tsx          # Live transcript display
│   │   └── TrackingSheet.tsx             # ETA, ambulance info, progress bar
│   ├── institution/
│   │   └── BroadcastModal.tsx            # Emergency alert accept/reject
│   ├── shared/
│   │   └── VoiceChat.tsx                 # WebRTC voice chat (both sides)
│   ├── maps/
│   │   └── WaastaMap.tsx                 # MapLibre map with route lines
│   └── ui/                              # shadcn/ui components
│       ├── map.tsx                       # MapLibre GL primitives
│       ├── button.tsx, badge.tsx, card.tsx, dialog.tsx, drawer.tsx
├── lib/
│   ├── agents/graph.ts                   # LangGraph 5-node state machine
│   ├── voice-ai.ts                       # Whisper + Groq conversation engine
│   ├── voice-channel.ts                  # WebRTC + Supabase signaling
│   ├── routing.ts                        # OSRM route fetcher
│   ├── simulation.ts                     # Ambulance movement engine
│   ├── geocoding.ts                      # Reverse geocoding
│   ├── constants.ts                      # Karachi landmarks + config
│   ├── store.ts                          # Zustand stores + broadcast queue
│   ├── supabase/client.ts                # Lazy Supabase client
│   └── utils.ts                          # cn() helper
└── types/index.ts                        # TypeScript interfaces
```

---

## Database Schema

### Tables (Supabase PostgreSQL)

**institutes** — Rescue organizations
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | e.g., "Edhi Foundation - Gulshan" |
| type | TEXT | ambulance, fire, police, rescue |
| zone | TEXT | Karachi zone |
| lat, lng | FLOAT | Station coordinates |
| is_available | BOOLEAN | Accepting broadcasts |

**resources** — Individual vehicles
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| institute_id | UUID | FK to institutes |
| call_sign | TEXT | e.g., "EDH-01" |
| lat, lng | FLOAT | Live position (updated by simulation) |
| status | TEXT | available, dispatched, en_route, on_scene, returning |

**incidents** — Each emergency
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| transcript | TEXT | Raw caller transcript |
| summary | TEXT | AI-parsed Roman Urdu summary |
| incident_type | TEXT | accident, fire, medical, crime, other |
| severity | INT | 1-5 |
| landmark | TEXT | Matched location name or "GPS Location" |
| lat, lng | FLOAT | Geocoded or GPS coordinates |
| status | TEXT | intake → geocoded → broadcasting → accepted → en_route → on_scene → resolved |
| accepted_by | UUID | FK to institutes |
| assigned_resource | UUID | FK to resources |
| route_waypoints | JSONB | OSRM road route [[lat,lng]...] |
| route_distance_km | FLOAT | Total route distance |
| route_duration_min | FLOAT | Estimated drive time |
| route_progress_step | INT | Current waypoint index |
| exclude_list | UUID[] | Rejected institute IDs |

**incident_broadcasts** — HITL handshake
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| incident_id | UUID | FK to incidents |
| institute_id | UUID | FK to institutes |
| status | TEXT | pending, accepted, rejected |
| confidence | FLOAT | Match confidence score |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voice/chat` | POST | Send audio → Whisper STT → LLM → response text |
| `/api/ai/parse-incident` | POST | Groq LLM parses transcript → structured incident data |
| `/api/agent/trigger` | POST | Create incident + run LangGraph pipeline |
| `/api/agent/respond` | POST | Institution accept/reject (HITL) |
| `/api/dispatch` | POST | Assign ambulance + calculate OSRM route |
| `/api/simulate/step` | POST | Advance ambulance one waypoint |
| `/api/demo/trigger` | POST | Random Karachi emergency scenario |

---

## Incident Lifecycle

```
intake → geocoded → broadcasting → accepted → en_route → on_scene → resolved
                       │                ▲
                       │   REJECT        │
                       └──► next inst ──►┘
```

| Status | Trigger | What Happens |
|--------|---------|-------------|
| `intake` | Civilian submits | Groq LLM parses transcript |
| `geocoded` | Landmark matched | Coordinates resolved (landmark or GPS) |
| `broadcasting` | Institute found | Broadcast sent, institution dashboard rings |
| `accepted` | Institution clicks ACCEPT | Voice chat auto-connects |
| `en_route` | Institution clicks DISPATCH | OSRM route calculated, ambulance starts moving |
| `on_scene` | Ambulance arrives | Simulation complete |
| `resolved` | Manually dismissed | Resources freed, incident cleared |

---

## Concurrency Model

### Broadcast Queue
```
Call 1 arrives → popup shows (dispatcher free)
  ACCEPT → isBusy = true, popup dismissed
Call 2 arrives → QUEUED silently ("1 Waiting" badge)
Call 3 arrives → QUEUED ("2 Waiting" badge pulses)
Call 1 resolved → isBusy = false → Call 2 popup shows
Call 2 resolved → Call 3 popup shows
```

### Multiple Ambulance Simulation
- Each ambulance runs independently via client-side polling
- `/api/simulate/step` advances one ambulance one waypoint per call
- Dashboard runs `setInterval(2s)` per `en_route` incident
- No server-side long-running processes — fully stateless

---

## Karachi Landmarks (Geocoding)

10 hardcoded landmarks with exact coordinates:

| Landmark | Zone | Lat | Lng |
|----------|------|-----|-----|
| Moti Mahal | Gulshan | 24.9204 | 67.0932 |
| Lucky One Mall | FB Area | 24.9312 | 67.0901 |
| Do Darya | DHA | 24.7981 | 67.0645 |
| Nipa Chowrangi | Gulshan | 24.9175 | 67.0972 |
| Nursery | PECHS | 24.8615 | 67.0542 |
| Clifton Bridge | Clifton | 24.8206 | 67.0305 |
| Tariq Road | PECHS | 24.8690 | 67.0649 |
| Saddar | Saddar | 24.8607 | 67.0100 |
| Korangi Crossing | Korangi | 24.8320 | 67.1270 |
| North Nazimabad | North Nazimabad | 24.9420 | 67.0350 |

Falls back to browser GPS coordinates when no landmark matches.

---

## Setup

### 1. Install
```bash
cd guardian
npm install --legacy-peer-deps
```

### 2. Supabase
1. Create a Supabase project
2. Run `supabase/schema_v2.sql` in SQL Editor
3. Run `supabase/add_route_columns.sql` in SQL Editor
4. Ensure Realtime is enabled for: `incidents`, `incident_broadcasts`, `resources`

### 3. Environment Variables
`.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
GROQ_API_KEY=your_groq_api_key
```

### 4. Run
```bash
npm run dev
```

| Page | URL |
|------|-----|
| Landing | http://localhost:3000 |
| Civilian SOS | http://localhost:3000/civilian |
| War Room | http://localhost:3000/institution/dashboard |

### 5. Reset Data
Run `supabase/reset.sql` in SQL Editor to clear all incidents and reset ambulances to station.

---

## Demo

Click **Demo** (bottom of civilian page) to trigger a random Karachi emergency without voice input.

5 scenarios in Roman Urdu:
- Road accident at Nipa Chowrangi
- Medical emergency at Moti Mahal
- Bike accident near Lucky One Mall
- Snatching incident at Do Darya
- Building fire near Nursery

---

## What Makes This Different

| Feature | Traditional 1122/911 | Waasta |
|---------|----------------------|--------|
| Response time | Minutes to route | < 30 seconds AI triage |
| Language | Operator must understand | AI understands Urdu/Roman Urdu/English |
| Dispatch | Manual radio coordination | Automated nearest-ambulance selection |
| Tracking | No visibility | Real-time map with OSRM road routes |
| Concurrency | One call at a time | Queue system with priority |
| Cost | Expensive call centers | $0 AI pipeline (Groq free tier) |
| Voice | Phone lines (GSM) | WebRTC (browser, no phone needed) |

---

## Team

Built during AI Mustaqbil 2.0 — 24-hour sprint.

---

## License

MIT
