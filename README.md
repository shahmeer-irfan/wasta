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
| **Broker Agent** | **A\* informed search** over a Karachi road graph picks the optimal available institute | A\* + binary min-heap + traffic-weighted edges |
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

## A\* Informed Search (Broker Agent) — Classical AI

The Broker node is the only place in Waasta where a *classical AI* algorithm is the load-bearing decision-maker. It uses **A\* search** (Hart, Nilsson & Raphael, 1968) to choose which available institute should receive the emergency broadcast. This replaces a naive nearest-neighbour reduce that ignored the road network's topology.

### Why A\* (and not haversine, BFS, or DFS)

The previous broker did:

```ts
// O(n) linear scan, "nearest as the crow flies"
const nearest = institutes.reduce((best, inst) =>
  haversine(incident, inst) < haversine(incident, best) ? inst : best
);
```

That's wrong in any city with non-trivial topology. Karachi's harbour, single-bridge crossings (Clifton Bridge), and chronic congestion at Saddar make road distance very different from straight-line distance. Two institutes can be 4 km apart on a map but 12 km apart by road. The broker also can't account for traffic this way.

| Algorithm | Why it fits this problem | Why we picked it |
|-----------|--------------------------|------------------|
| **BFS / DFS** *(uninformed)* | Walks the same graph but with no heuristic. Finds *a* path, not necessarily the shortest. | Skipped — uninformed search is academically weaker for this use case |
| **Dijkstra** *(uninformed UCS)* | Finds the optimal path. | Becomes A\* the moment we add a heuristic — same code, more expansions |
| **Greedy best-first** | Uses heuristic only — fast but not optimal. | Skipped — non-optimal answers in a life-safety pipeline are unacceptable |
| **A\*** *(informed)* | Optimal *and* fast: combines true cost-so-far `g(n)` with admissible heuristic `h(n)`. | **Picked** — minimises expanded nodes while guaranteeing the optimal institute |
| **CSP / Genetic** | Better fit for *multi-incident* assignment problems. | Out of scope — Waasta currently dispatches one incident at a time |

A\* is the textbook fit, matches **Week 5 (Informed Search)** of the syllabus, and produces a richly demonstrable trace that the dashboard can render.

### The graph

A small (~14 node) hand-built graph of Karachi:

| Node kind | Source | Count |
|-----------|--------|-------|
| **landmark** | Hand-coded points in [`src/lib/constants.ts`](src/lib/constants.ts) | 10 |
| **institute** | Pulled from Supabase `institutes` table where `is_available = true` | 1–N |
| **incident** | Added per query at the caller's lat/lng | 1 |

**Edges** are undirected. Static landmark↔landmark adjacencies are hand-curated in [`src/lib/ai/karachi-graph.ts`](src/lib/ai/karachi-graph.ts) based on actual Karachi geography:

```
Moti Mahal ─── Nipa Chowrangi ─── Lucky One Mall ─── North Nazimabad
     │              │                                      │
Korangi Crossing    │                                  Saddar (1.30×)
     │              │                                      │
Tariq Road      Moti Mahal                          Clifton Bridge (1.40×)
     │           (1.10×)                                   │
Nursery ─── Saddar (1.30×) ─── Clifton Bridge ─── Do Darya
                                                           │
                                                  Korangi Crossing
```

Each institute is auto-linked to its **2 nearest landmarks**. The incident is auto-linked to its **2 nearest non-incident nodes** (landmarks or institutes — so a very-near institute can be a one-hop goal).

**Edge cost** = `haversine_km × trafficFactor`. The traffic factor is `1.0` by default, raised to `1.30–1.40` on chronically congested arterials (Saddar, Clifton Bridge). This is what differentiates A\*'s answer from straight-line haversine.

### The heuristic — and why it's admissible

```ts
h(n) = min over goals g of haversine(n, g)
```

For A\* to return the **optimal** path, the heuristic must be *admissible*: it must never overestimate the true remaining cost. Since every edge cost is `haversine × trafficFactor` with `trafficFactor ≥ 1.0`, the true shortest road distance from `n` to any goal is *at least* the straight-line haversine to the nearest goal. So `h ≤ true cost`, always. Optimality holds.

### The A\* code

`src/lib/ai/a-star.ts` — generic, ~80 lines. Lazy decrease-key (push possibly-duplicate entries, skip already-closed nodes on pop) so we don't need a fancy heap.

```ts
function aStar({ start, isGoal, graph, heuristic }) {
  const open = new MinHeap<NodeId>();        // OPEN set (min-heap by f-score)
  const gScore = new Map();                   // best known g(n)
  const cameFrom = new Map();                 // parent pointers for path reconstruction
  const closed = new Set();                   // CLOSED set
  const expandedNodes = [];                   // pop order — for visualisation

  gScore.set(start, 0);
  open.push(start, heuristic(start));         // f(start) = 0 + h(start)

  while (!open.isEmpty()) {
    const current = open.pop();
    if (closed.has(current)) continue;        // stale duplicate, skip
    closed.add(current);
    expandedNodes.push(current);

    if (isGoal(current)) return reconstructPath(...);

    for (const { to, cost } of graph.neighbors(current)) {
      if (closed.has(to)) continue;
      const tentativeG = gScore.get(current) + cost;
      if (tentativeG < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, current);
        gScore.set(to, tentativeG);
        open.push(to, tentativeG + heuristic(to));   // f(to) = g + h
      }
    }
  }
  return { found: false, ... };
}
```

`src/lib/ai/min-heap.ts` is a textbook binary min-heap with `bubbleUp` and `bubbleDown` — `O(log n)` push and pop.

### Wired into the broker

In [`src/lib/agents/graph.ts`](src/lib/agents/graph.ts), the Broker node:

1. Queries available institutes from Supabase (filters by `is_available = true` and removes rejected ones from `exclude_list`).
2. Calls `buildKarachiGraph(institutes, incidentLocation)` to produce the in-memory graph.
3. Runs A\* with `start = INCIDENT_NODE_ID`, `isGoal = id ∈ instituteNodeIds`, and the multi-goal haversine heuristic.
4. Resolves the goal node back to the chosen institute (strips the `inst:` prefix from the node ID).
5. Falls back to plain haversine reduce if A\* finds no path (graph disconnected — should never happen with the current adjacency).
6. Persists the full search trace (chosen path, expanded nodes in order, cost, hops, ms) to the `incidents.search_trace` JSONB column for the dashboard to render.

### Verified output (live demo)

Running a real demo emergency at Korangi Crossing produces this server-side log:

```
[GRAPH:BROKER] A* found Edhi Foundation - Gulshan via 3 hops, cost 11.52 km, expanded 4/12 nodes in 3ms
[GRAPH:BROKER] A* path: Incident → Korangi Crossing → Moti Mahal → Edhi Foundation - Gulshan
```

A\* expanded only **4 of 12** nodes — the heuristic is doing its job (a Dijkstra without `h` would explore many more). The chosen 3-hop path through Moti Mahal is provably optimal: any alternate route (via Saddar or via Do Darya/Clifton) is longer because of the traffic factors on those edges.

### Where to look

| File | Role |
|------|------|
| [`src/lib/ai/a-star.ts`](src/lib/ai/a-star.ts) | Generic A\* — start, goal predicate, graph, heuristic |
| [`src/lib/ai/min-heap.ts`](src/lib/ai/min-heap.ts) | Binary min-heap for the OPEN set |
| [`src/lib/ai/karachi-graph.ts`](src/lib/ai/karachi-graph.ts) | Graph builder + multi-goal haversine heuristic |
| [`src/lib/agents/graph.ts`](src/lib/agents/graph.ts) | `brokerNode` calls A\*, persists trace |
| [`supabase/add_search_trace.sql`](supabase/add_search_trace.sql) | Migration for the `search_trace` JSONB column |
| [`src/app/institution/dashboard/page.tsx`](src/app/institution/dashboard/page.tsx) | `SearchTraceBadge` renders the algorithm's reasoning in the war room |
| [`src/types/index.ts`](src/types/index.ts) | `SearchTrace` interface |

### Algorithmic complexity (for the report)

| Quantity | Value |
|----------|-------|
| Graph size `\|V\|` | landmarks (10) + institutes (1–3) + incident (1) ≈ 12–14 |
| Graph size `\|E\|` | ~30 (bidirectional landmark adjacencies + 2/institute + 2 for incident) |
| A\* time | `O((V + E) log V)` with min-heap — in practice 3–5 ms per dispatch |
| A\* space | `O(V)` for `gScore`, `cameFrom`, `closed`, OPEN |
| Optimality | **Guaranteed** — heuristic is admissible (haversine ≤ road distance) |
| Completeness | **Guaranteed** — finite graph, non-negative edges |

### Setup — run the migration

A\* runs whether or not the migration is applied; only the persisted trace badge needs the new column. To enable it:

```sql
-- Paste into the Supabase SQL Editor, or copy from supabase/add_search_trace.sql
ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS search_trace JSONB DEFAULT NULL;
```

After running, the next dispatched incident will show a small **A\* · N hops · X.XX km · EXP n/m** badge in the dashboard's active-dispatch panel. Click it to expand the full path of nodes the search walked.

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
│   ├── ai/                               # Classical AI algorithms (informed search)
│   │   ├── a-star.ts                       # Generic A* with full instrumentation
│   │   ├── min-heap.ts                     # Binary min-heap for the OPEN set
│   │   └── karachi-graph.ts                # Karachi road graph + admissible heuristic
│   ├── voice-ai.ts                       # Whisper + Groq conversation engine
│   ├── voice-channel.ts                  # WebRTC + Supabase signaling
│   ├── routing.ts                        # OSRM route fetcher
│   ├── simulation.ts                     # Ambulance movement engine
│   ├── geocoding.ts                      # Reverse geocoding
│   ├── constants.ts                      # Karachi landmarks + config
│   ├── store.ts                          # Zustand stores + broadcast queue
│   ├── theme.ts                          # Dashboard light/dark theme toggle
│   ├── supabase/client.ts                # Lazy Supabase client
│   └── utils.ts                          # cn() helper
└── types/index.ts                        # TypeScript interfaces (incl. SearchTrace)
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
| search_trace | JSONB | A* search instrumentation (path, expanded nodes, cost, ms) |

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
4. Run `supabase/add_search_trace.sql` in SQL Editor *(adds the A\* trace column — optional but enables the search-trace badge in the war room)*
5. Ensure Realtime is enabled for: `incidents`, `incident_broadcasts`, `resources`

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
