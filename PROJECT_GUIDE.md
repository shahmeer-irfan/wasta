# Waasta — Project Guide (Internal)

A working notebook to keep me oriented across this codebase. Pulls from `README.md` plus my own walkthrough of the source. Updated to reflect the current state after the A\* broker, the UI revamp, and the realtime/WebRTC hardening.

---

## 1. What this project is

**Waasta** (folder name `guardian`, package name `vaasta`) is an AI-powered emergency response system for Karachi. Built for AI Mustaqbil 2.0.

Three "personas" share one Next.js app:

1. **Civilian** (`/civilian`) — mobile-first SOS UI. Big SOS button, voice AI call, live map showing the assigned ambulance approaching.
2. **Institution / War Room** (`/institution/dashboard`) — dispatcher console with a **dark/light theme toggle**. Sees incoming emergency broadcasts, accepts/rejects, dispatches ambulances, monitors live routes. Shows the **A\* search trace** for each broker decision.
3. **Landing** (`/`) — picks between the two. Cinematic editorial cover with a live ticker and a hero map preview.

End-to-end flow:

> Civilian speaks Urdu/Roman Urdu → Whisper transcribes → LLM parses into a structured incident → 5-node LangGraph runs (intake → geocode → **A\* broker** → pivot → patch) → institution accepts → WebRTC voice connects → dispatcher hits Dispatch → OSRM computes the road route → both maps animate the ambulance.

A\* is the *informed-search* algorithm that picks **which institute** to broadcast to. OSRM is what plots the actual **road waypoints** for the chosen ambulance once dispatched. Two different jobs.

**Cost: $0 to run** — Groq free tier for STT+LLM, browser SpeechSynthesis for TTS, free OSRM public server, Supabase free tier.

---

## 2. Tech stack at a glance

| Layer | What's used |
|-------|-------------|
| Framework | Next.js 14 App Router + TypeScript, `reactStrictMode: false` (see §15) |
| Styling | Tailwind + Framer Motion + shadcn/ui (Radix). Custom design system: paper / ink surfaces, Fraunces variable serif, Geist Sans + Mono |
| AI orchestration | LangGraph.js (`@langchain/langgraph`) |
| **Classical AI (broker)** | **A\* informed search** with admissible haversine heuristic over a hand-curated Karachi road graph |
| LLM | Groq, Llama 3.3 70B (`@langchain/groq` + raw `groq-sdk`) |
| STT | Groq Whisper large-v3 |
| TTS | Browser `SpeechSynthesis` (free) — `edge-tts` is in deps but the live path is the browser API |
| DB + realtime | Supabase (PostgreSQL + Realtime channels) |
| Maps | MapLibre GL — Voyager (light) and Dark Matter (dark) basemaps swap with theme |
| Routing | OSRM public server (no API key) — used in `/api/dispatch` after A\* picks the institute |
| Voice chat | WebRTC + Supabase Broadcast for SDP/ICE signaling, with a 2-second offer-retry loop for late-joiner robustness |
| Client state | Zustand stores: `useWaastaStore` (civilian) + `useInstitutionStore` (war room) |
| Theme | `useDashboardTheme` hook persists ink/paper to localStorage. Civilian + landing always render paper |

Legacy deps still in `package.json`: `@11labs/*`, `twilio`, `vapi/webhook` route. Not used by the live flow.

---

## 3. Repo layout (the parts that matter)

```
guardian/
├── README.md                    # canonical reference — has the full A* writeup
├── PROJECT_GUIDE.md             # this file
├── .env.local                   # secrets (Supabase + Groq)
├── package.json                 # name = vaasta
├── next.config.mjs              # reactStrictMode: false  (see §15)
├── tailwind.config.ts           # CSS-var-driven design tokens
├── supabase/
│   ├── schema_v2.sql            # tables: institutes, resources, incidents, incident_broadcasts
│   ├── add_route_columns.sql    # OSRM route columns added to incidents
│   ├── add_search_trace.sql     # ★ A* search trace JSONB column (run this!)
│   └── reset.sql                # wipe incidents, reset ambulances
└── src/
    ├── app/
    │   ├── layout.tsx           # Geist Sans + Mono + Fraunces variable serif imports
    │   ├── globals.css          # paper/ink design tokens, motion keyframes, surface backgrounds
    │   ├── page.tsx             # landing — editorial split, live ticker, hero mini-map, mission footer
    │   ├── civilian/page.tsx    # mobile SOS UI (paper aesthetic, mergeIncident realtime fix)
    │   ├── institution/dashboard/page.tsx  # war room — ink/paper toggle, FIDS stats, editorial briefs, A* trace badge
    │   └── api/
    │       ├── ai/parse-incident/  # Groq parses transcript → IncidentCard
    │       ├── agent/trigger/      # creates incident + runs LangGraph
    │       ├── agent/respond/      # HITL accept/reject (resumes graph)
    │       ├── dispatch/           # picks ambulance + OSRM route
    │       ├── simulate/step/      # advance one ambulance one waypoint
    │       ├── simulate/return/    # send ambulance back to station
    │       ├── voice/chat/         # Whisper STT + LLM turn
    │       ├── voice/tts/          # TTS helper (legacy-ish — browser TTS wins)
    │       ├── demo/trigger/       # one-click random emergency
    │       ├── vapi/webhook/       # legacy
    │       └── elevenlabs/tool/    # legacy
    ├── components/
    │   ├── civilian/
    │   │   ├── EmergencyCall.tsx     # voice AI call UI
    │   │   ├── SOSButton.tsx         # animated SOS trigger
    │   │   ├── TranscriptStream.tsx  # live transcript display
    │   │   └── TrackingSheet.tsx     # ETA, ambulance info, progress bar
    │   ├── institution/
    │   │   └── BroadcastModal.tsx    # accept/reject popup
    │   ├── shared/
    │   │   └── VoiceChat.tsx         # WebRTC, both sides
    │   ├── maps/
    │   │   └── WaastaMap.tsx         # MapLibre wrapper (theme + interactive props)
    │   └── ui/
    │       ├── map.tsx               # Map primitives — fixed setStyle + ResizeObserver + styleVersion
    │       ├── typography.tsx        # ★ design atoms (Display, MonoTag, NumericStat, StatusUnderline, SeverityBars, Eyebrow, WaveformBar)
    │       └── ...                   # other shadcn primitives (button, card, dialog, …)
    ├── lib/
    │   ├── agents/graph.ts           # LangGraph 5-node state machine — broker uses A*
    │   ├── ai/                       # ★ classical AI module (added in this revamp)
    │   │   ├── a-star.ts               # generic A* with full instrumentation
    │   │   ├── min-heap.ts             # binary min-heap (OPEN set)
    │   │   └── karachi-graph.ts        # Karachi road graph + admissible heuristic
    │   ├── voice-ai.ts               # Whisper + Groq conversation engine
    │   ├── voice-channel.ts          # WebRTC + Supabase signaling (offer retry loop)
    │   ├── routing.ts                # OSRM fetch
    │   ├── simulation.ts             # ambulance movement engine
    │   ├── geocoding.ts              # reverse geocode fallback
    │   ├── constants.ts              # 10 Karachi landmarks + Karachi center
    │   ├── store.ts                  # Zustand stores + broadcast queue
    │   ├── theme.ts                  # ★ dashboard light/dark toggle (localStorage-persisted)
    │   ├── supabase/client.ts        # lazy Supabase client (anon + service role)
    │   └── utils.ts                  # cn() helper
    └── types/index.ts                # all TS interfaces (incl. SearchTrace)
```

---

## 4. The LangGraph pipeline (the heart of the system)

File: `src/lib/agents/graph.ts`

Five nodes, one HITL pause:

```
START → intake → geocode → broker (A*) → pivot ──ACCEPT→ patch → END
                                ▲          │
                                │          ├──REJECT→ broker (loop, with exclude_list)
                                └──────────┘
                                           └──no decision→ END (paused)
```

**State** (`WaastaState`):
- `transcript` — raw caller text
- `incident_id` — Supabase row UUID
- `incident_card` — parsed: type, severity, landmark, summary, lat, lng, zone
- `landmark_match` — geocoded landmark or null
- `broadcast_id`, `target_institute_id` — current broadcast handshake
- `exclude_list` — institutes that already rejected (for retry loop)
- `pivot_decision` — '' | 'ACCEPT' | 'REJECT'
- `status`, `error`

**Per-node behaviour**:

| Node | What it does |
|------|--------------|
| `intake` | Calls `/api/ai/parse-incident` (Groq Llama 3.3 70B) to turn transcript into structured `IncidentCard`. Falls back to keyword heuristics if Groq fails. Inherits GPS coords from the trigger payload. Writes to `incidents` table. |
| `geocode` | Scores each of the 10 Karachi landmarks against the transcript (exact match = 100+, word match = wordlen×2, zone match = +5). Threshold 6 to count as match. Otherwise falls back to GPS coords or Karachi center, then reverse-geocodes for a name. Writes coords + landmark to `incidents`. |
| **`broker`** | **A\* informed search** over a built-on-the-fly Karachi graph (10 landmarks + N institutes + 1 incident node). Picks the cheapest available institute by traffic-weighted edge cost; haversine to nearest goal is the admissible heuristic. Persists the full search trace (path, expanded nodes, cost, ms) to `incidents.search_trace`. Falls back to plain haversine reduce if the graph somehow returns no path. Inserts a row into `incident_broadcasts`. Sets incident status `broadcasting`. See §17 for details. |
| `pivot` | HITL gate. If `pivot_decision` is empty → returns and the conditional edge routes to `END` (graph pauses). When `/api/agent/respond` resumes the graph with ACCEPT → updates incident to `accepted`. With REJECT → adds the institute to `exclude_list` (persisted to DB so it survives re-invocation), clears decision, status back to `broadcasting`, conditional edge routes back to `broker`. Same A\* runs again with the rejected institute removed from the goal set. |
| `patch` | Just confirms accepted state. The actual dispatch (assigning a vehicle + OSRM route) is a separate `/api/dispatch` call triggered when the dispatcher clicks Dispatch. |

**Why pivot persists `exclude_list` to DB**: graph state is recreated each time `/api/agent/respond` re-invokes the graph, so the exclusion has to live somewhere durable.

---

## 5. The full incident lifecycle (status field)

```
intake → geocoded → broadcasting → accepted → en_route → on_scene → returning → resolved
                         ▲              ▲
                         │              │
                       REJECT loop      └── /api/dispatch fires here (OSRM route + ambulance)
```

| Status | Set by | Visible effect |
|--------|--------|----------------|
| `intake` | trigger / intake node | Civilian sees "request sent" |
| `geocoded` | geocode node | Coords resolved |
| `broadcasting` | broker node (after A\*) | Institution dashboard popup rings |
| `accepted` | pivot node (ACCEPT) | WebRTC voice chat auto-connects |
| `en_route` | `/api/dispatch` | OSRM route written, ambulance starts moving |
| `on_scene` | simulation reaches final waypoint | Map shows arrival |
| `returning` | 5s after `on_scene` | Ambulance walks waypoints back to station |
| `resolved` | return reaches step 0 (or manual dismiss) | Resources freed |

The dashboard's `STATUS_CONFIG` covers all 10 statuses now (was missing `en_route`/`on_scene`/`returning` — they used to fall back to `intake` and show "Processing" with a spinner).

---

## 6. Voice AI pipeline (civilian-side conversation)

File: `src/lib/voice-ai.ts`, route: `src/app/api/voice/chat/route.ts`, UI: `EmergencyCall.tsx`.

```
mic chunks (8s) → POST /api/voice/chat
                     ↓
              Groq Whisper large-v3 (Urdu/Hindi STT)
                     ↓
              Groq Llama 3.3 70B (chat with system prompt + tools)
                     ↓
        tool call detected? → create incident + run LangGraph
                     ↓
              return text response
                     ↓
       browser SpeechSynthesis speaks (ur-PK voice)
                     ↓
              auto-record next turn
```

The LLM has a tool/function it can call to actually create the incident — that's how voice turns into structured data without a separate "submit" button.

---

## 7. Maps + simulation

`WaastaMap.tsx` is a thin MapLibre GL wrapper. Renders:
- Incident pin
- Institute station pin
- Ambulance vehicle pin (live position)
- Gray polyline = full planned route
- Orange polyline = covered portion (so far)

**Theme-aware basemap**: Voyager when `theme="light"`, Dark Matter when `theme="ink"`. The dashboard toggle flips it live.

**Routes** come from OSRM public server via `lib/routing.ts`. 50–333 waypoints stored as JSONB in `incidents.route_waypoints`.

**Simulation** is **client-driven**: dashboard runs `setInterval(800ms)` per `en_route` incident calling `/api/simulate/step`, which advances `route_progress_step` by 1. Both civilian and institution maps subscribe via Supabase Realtime so they see the same advance. Stateless server.

**Route hides during `returning`** — the broker's outbound route is no longer relevant once the ambulance turns home. `ROUTE_DISPLAY_STATUSES` in the dashboard filters to `dispatched | en_route | on_scene` only.

**MapLibre fixes (this session)**:
1. **`ResizeObserver` → `map.resize()`** — without this the canvas would freeze at the size it had on first paint (leaving a black dead area below the tiles when the layout grew).
2. **`map.setStyle()` on theme change** — the Map component's init effect runs once, so a new effect listens for `theme` changes and swaps the basemap.
3. **`styleVersion` counter on MapContext** — `setStyle({ diff: false })` wipes user-added layers (the route polyline). `MapRoute` now depends on `styleVersion` and re-attaches its source + layer after every style swap. Markers survive automatically (DOM elements, not layers).

---

## 8. WebRTC voice chat (civilian ↔ dispatcher)

File: `src/lib/voice-channel.ts`, UI: `components/shared/VoiceChat.tsx`.

- Uses Supabase Realtime *broadcast channels* as the signaling transport (no STUN/TURN needed for same-network demos; default Google STUN servers handle internet).
- SDP offer/answer + ICE candidates flow through a channel keyed by `incident_id`.
- Auto-connects the moment the institution clicks ACCEPT.
- Hangup propagation: ending on one side ends both via a `hangup` broadcast event.

**Critical hardening this session**:

- **Civilian re-broadcasts the offer every 2s until answered.** Supabase Broadcast does not buffer messages for late joiners — a one-shot offer was getting lost when the institution finished subscribing 2.6s after the civilian. Re-broadcasting the same SDP makes the handshake idempotent. Cancels on `connected` / `failed` / `closed` / `cleanup`.
- **`reactStrictMode: false`** in `next.config.mjs`. StrictMode's intentional double-mount in dev was tearing down and recreating the channel mid-handshake — `cleanup()` called `supabase.removeChannel()` which severed the *server-side* topic subscription that the freshly-mounted second instance was sharing. Production never double-mounts, so this is dev-only protection.

---

## 9. Database schema (Supabase)

Tables:

- **institutes** — `id, name, type, zone, lat, lng, is_available`. Seeded with rescue orgs.
- **resources** — `id, institute_id (FK), call_sign, lat, lng, status`. Individual vehicles.
- **incidents** — the big one. `id, transcript, summary, incident_type, severity, landmark, lat, lng, status, accepted_by, assigned_resource, exclude_list (UUID[])`,
  - + from `add_route_columns.sql`: `route_waypoints (JSONB), route_distance_km, route_duration_min, route_progress_step`
  - + from `add_search_trace.sql`: **`search_trace JSONB`** ← the A\* trace
- **incident_broadcasts** — HITL handshake. `id, incident_id, institute_id, status (pending|accepted|rejected), confidence`.

Realtime must be enabled for: `incidents`, `incident_broadcasts`, `resources`. The civilian & institution UIs subscribe to these channels.

**TOAST gotcha (very important — see §15)**: Postgres TOASTs JSONB values >2KB and logical replication *omits unchanged TOASTed columns* from UPDATE WAL entries. `route_waypoints` is ~5–10KB. Every `simulate/step` UPDATE arrives with `route_waypoints: null` in `payload.new`. Both the dashboard and civilian incident handlers now use a `mergeIncident` helper that preserves the existing value when the patch's `route_waypoints` is null. Without this, the route polyline used to vanish from the map every ~800ms.

---

## 10. API endpoints (live, non-legacy)

| Endpoint | Method | What it does |
|----------|--------|--------------|
| `/api/voice/chat` | POST | audio blob → Whisper → Llama → maybe-create-incident → text response |
| `/api/ai/parse-incident` | POST | transcript → structured IncidentCard JSON |
| `/api/agent/trigger` | POST | inserts incident row, kicks off LangGraph |
| `/api/agent/respond` | POST | dispatcher accept/reject — resumes the LangGraph at pivot |
| `/api/dispatch` | POST | picks the closest available ambulance, fetches OSRM route, sets status `en_route` |
| `/api/simulate/step` | POST | advances one ambulance one waypoint |
| `/api/simulate/return` | POST | sends ambulance back to its station |
| `/api/demo/trigger` | POST | one-click random Karachi scenario |
| `/api/voice/tts` | POST | TTS helper (legacy-ish — browser TTS is the live path) |
| `/api/vapi/webhook` | POST | **legacy** Vapi webhook |
| `/api/elevenlabs/tool` | POST | **legacy** ElevenLabs tool handler |

---

## 11. Concurrency model (what to remember)

- **Broadcast queue** (`lib/store.ts`): Zustand store. First arriving broadcast pops the modal. Subsequent ones queue silently with a "X Waiting" pulsing badge. When the current one resolves (accept/reject/dismiss), the next is promoted via `finishCall()`.
- **Multi-ambulance simulation**: each `en_route` incident gets its own `setInterval(800ms)` on the dashboard hitting `/api/simulate/step`. Server is fully stateless — no long-running processes.
- **Reject loop**: if institution rejects, `exclude_list` grows in DB and broker re-runs A\* with the rejected institute removed from the goal set. Loop terminates when no institutes remain (graph errors out cleanly).

---

## 12. Karachi landmarks (geocoding + A\* graph nodes)

10 hardcoded points in `src/lib/constants.ts` (Moti Mahal, Lucky One Mall, Do Darya, Nipa Chowrangi, Nursery, Clifton Bridge, Tariq Road, Saddar, Korangi Crossing, North Nazimabad). They serve **two** purposes now:

1. **Geocoding**: matched against the caller's transcript by the geocode node.
2. **A\* graph nodes**: form the backbone of the road graph used by the broker to pick the optimal institute (see §17).

If transcript matches none with score ≥ 6, falls back to caller GPS, otherwise Karachi center (24.8607, 67.0011).

---

## 13. Running locally

```bash
cd guardian
npm install --legacy-peer-deps    # only first time
npm run dev
```

| Page | URL |
|------|-----|
| Landing | http://localhost:3000 |
| Civilian SOS | http://localhost:3000/civilian |
| War Room | http://localhost:3000/institution/dashboard |

`.env.local` holds Supabase + Groq keys. All three routes return HTTP 200 — verified.

**SQL migrations to run on first setup** (Supabase SQL Editor, in this order):

1. `supabase/schema_v2.sql` — base tables
2. `supabase/add_route_columns.sql` — OSRM route columns
3. **`supabase/add_search_trace.sql`** — adds `search_trace` JSONB for the A\* trace badge. Without it the broker still works (A\* runs and dispatch happens) but the badge in the war room won't render.

To reset incidents and put ambulances back at their stations: run `supabase/reset.sql`.

To trigger a fake emergency: `/civilian` → bottom **Demo** button, or `POST /api/demo/trigger`. Picks one of 5 Karachi scenarios.

---

## 14. Demo script (what to click in what order)

1. Open `/institution/dashboard` in one tab/window.
2. Open `/civilian` in another.
3. On civilian: click **Demo** at the bottom (or press the SOS button + speak Urdu).
4. War Room: popup rings → **Accept**. *Notice the **A\* trace badge** appear in the dispatch panel: "A\* · N hops · X.XX km · EXP n/m · Yms". Click to expand the path.*
5. WebRTC voice auto-connects (the offer-retry loop ensures this works even if one peer subscribes late).
6. War Room: click **Dispatch**. OSRM computes the actual road waypoints.
7. Both maps animate the ambulance along the route.
8. When the ambulance arrives → status `on_scene`. After 5s the return trip begins. When it reaches the station → `resolved`.
9. *Try the **theme toggle** in the war-room top-right corner: the basemap, the chrome, and the route line all swap between paper and ink without losing any state.*

---

## 15. Things that would have tripped me up

- The package name in `package.json` is `vaasta` (typo or branding pivot). Folder is `guardian`. Product is **Waasta**. All three refer to the same thing.
- Leaflet AND MapLibre are both in dependencies. **MapLibre is the live one** (`WaastaMap.tsx`). Don't get distracted by Leaflet.
- ElevenLabs and Vapi/Twilio are in deps but **legacy**. The live voice stack is Groq Whisper + browser TTS + WebRTC.
- The graph **pauses** at the pivot node. It's not waiting in memory — it returns control and `/api/agent/respond` re-invokes the compiled graph with the decision. That's why `exclude_list` is persisted to DB.
- Simulation is client-polling, not server cron. If both maps are closed, ambulances stop moving.
- `getBaseUrl()` in `graph.ts` reads `NEXT_PUBLIC_APP_URL` server-side for self-fetches. If you change the port from 3000, update `.env.local`.
- **TOAST + Supabase Realtime**: any JSONB column over 2KB (`route_waypoints`, `search_trace`) is omitted from UPDATE payloads when not changed. Always use the `mergeIncident` helper instead of replacing the whole row from `payload.new`. (The civilian and dashboard handlers already do this.)
- **`reactStrictMode: false`** is intentional — see §8.
- **WebRTC offer is re-broadcast every 2s** until the answer arrives. Don't be surprised by `[VOICE:civilian] Re-broadcasting offer (peer not yet answered)` lines in the console; they stop as soon as the institution joins.
- `MapLibre.setStyle({ diff: false })` wipes user-added layers — the `MapRoute` primitive watches `styleVersion` from MapContext and re-attaches itself after every theme swap.
- The dashboard's `STATUS_CONFIG` covers all 10 status values (was missing `en_route`/`on_scene`/`returning` — those used to fall back to "Processing" with a spinner).
- The Supabase free-tier project auto-pauses after ~1 week of inactivity. If everything queries return empty, check the Supabase dashboard — resume restores everything.
- `intake` node calls `/api/ai/parse-incident` over HTTP from inside the graph (which itself runs in `/api/agent/trigger`). Self-fetch — if the dev server isn't ready yet, the first incident falls back to keyword heuristics.

---

## 16. Open questions to chase later

- Does the A\* trace in the dashboard need a **map-overlay visualization** (animated dots in expansion order)? Currently text-only badge — may add an SVG layer later.
- Civilian-side UI revamp (SOS halo, waveform call bar, redesigned tracking sheet) is *planned* but the page still uses the older paper aesthetic without the new typography atoms. Step 5 of the design plan.
- TURN server: Google STUN works for ~80–90% of users; in real Karachi mobile networks (carrier-grade NAT), some calls would fail without TURN. Add metered.ca free tier or Twilio TURN before production.
- Does the broker's A\* need to consider **resource availability count** per institute, not just distance? Currently any available institute is a goal regardless of how many ambulances it has free.
- Multi-incident CSP (Week 8 of the syllabus) is still on the table if there's time — would solve simultaneous assignment of N ambulances to M incidents under severity + distance constraints.

---

## 17. A\* informed search (the broker's classical AI) ★ new

This is the academic centrepiece — it satisfies the syllabus requirement (Week 5: Informed Search) and replaces what used to be a glorified `Math.min` over haversine distances.

### Files

- `src/lib/ai/min-heap.ts` — binary min-heap for the OPEN set. `O(log n)` push/pop, ~50 lines.
- `src/lib/ai/a-star.ts` — generic A\* with full instrumentation. Lazy decrease-key (push duplicates, skip closed nodes on pop). Returns `{ path, cost, expandedNodes, found, goalReached, gScores }`.
- `src/lib/ai/karachi-graph.ts` — graph builder + `multiGoalHaversineHeuristic`.
- `src/lib/agents/graph.ts` `brokerNode` — the call site.

### Graph

| Node kind | Source | Count |
|-----------|--------|-------|
| `landmark` | the 10 points in `lib/constants.ts` | 10 |
| `institute` | Supabase `institutes` table where `is_available=true` | 1–N |
| `incident` | added per query at the caller's lat/lng | 1 |

**Edges** are undirected. Static landmark↔landmark adjacencies are hand-curated based on real Karachi geography (12 edges). Each institute is auto-linked to its 2 nearest landmarks. The incident is auto-linked to its 2 nearest non-incident nodes.

**Edge cost** = `haversine_km × trafficFactor` where `trafficFactor ≥ 1.0`. Saddar links carry `1.30×`, Clifton Bridge `1.40×`, Korangi/Tariq Road `1.10–1.20×`. Plain landmark-to-landmark in Gulshan stays `1.0×`.

### Heuristic

`h(n) = min over goals g of haversine(n, g)`

**Admissibility argument**: every edge cost is `haversine × ≥ 1.0`, so the true shortest road cost from `n` to any goal is ≥ haversine to the nearest goal. So `h ≤ true cost`. A\* therefore returns the *optimal* institute.

### Verified output

A real demo emergency at Korangi Crossing produced this server-side log:

```
[GRAPH:BROKER] A* found Edhi Foundation - Gulshan via 3 hops, cost 11.52 km, expanded 4/12 nodes in 3ms
[GRAPH:BROKER] A* path: Incident → Korangi Crossing → Moti Mahal → Edhi Foundation - Gulshan
```

A\* expanded 4/12 nodes — the heuristic kept it tight. Path is optimal: alternates via Saddar (1.30×) or Do Darya/Clifton (1.10–1.40×) are all longer.

### Trace persistence

The full trace (algorithm, path, cost, hops, expanded nodes in order, took_ms, heuristic name, chosen institute) is written to `incidents.search_trace` JSONB. The dashboard's `SearchTraceBadge` reads it and renders a collapsed pill that expands to show the path nodes.

The broker writes the trace tolerantly — if the column is missing (migration not run), the broker logs a warning and retries the update without it. A\* still runs; only the badge is missing.

### Complexity

| Quantity | Value |
|----------|-------|
| `\|V\|` | 12–14 |
| `\|E\|` | ~30 |
| Time | `O((V + E) log V)` with min-heap — 3–5 ms per dispatch in practice |
| Space | `O(V)` |
| Optimal? | Yes (admissible heuristic) |
| Complete? | Yes (finite graph, non-negative edges) |

---

## 18. UI design system ★ new

Committed aesthetic: **"Operator's Field Notebook"** — editorial-meets-mission-control. Two surfaces, one action accent, distinctive typography, restrained motion.

### Surfaces (CSS variables in `app/globals.css`)

| Surface | Background | Used on |
|---------|-----------|---------|
| **Paper** | `#fbf7f1` cream + faint dot-matrix overlay | landing, civilian |
| **Ink** | `#0e0e10` near-black + faint grain + radial orange vignette | dashboard (default) |

The dashboard root applies `theme-ink surface-ink` or just `surface-paper` based on `useDashboardTheme`. Toggle via the sun/moon control in the top bar.

### Typography

- **Display / headlines** — `Fraunces` variable serif from Google Fonts. Optical-size axis 60–144, softness axis 30 (firm) for upright, 100 (rounded) for italic accents.
- **Body / UI** — Geist Sans (already loaded).
- **Numerics / IDs / mono captions** — Geist Mono uppercase with tabular nums and tracking.
- One **Roman Urdu** decorative line per major surface for Karachi character.

### Atoms (`src/components/ui/typography.tsx`)

- `Display` — Fraunces headlines, fluid clamp sizing
- `MonoTag` — small mono caps with size variants (xs/sm/md)
- `NumericStat` — large Fraunces numeral + mono unit + caption
- `StatusUnderline` — replaces pill badges. 2px coloured underline beneath a single mono-caps word. Newspaper-deck style.
- `SeverityBars` — 5-bar vertical equalizer (1–5)
- `Eyebrow` — `№ 03 · ACTIVE INCIDENTS` section header
- `WaveformBar` — fake-but-evocative voice meter (24 bars, animated heights when `active`)

### Motion

- Page-load reveals: 80ms staggered fade-up, max one cascade per route.
- Severity 5 incidents: heartbeat pulse (`animate-heartbeat`) on the right edge — nothing else pulses.
- Hero map route: `stroke-dashoffset` draw-in animation on first paint.
- Theme toggle: sliding pill (Framer `layout` transition).

### Theme toggle (`src/lib/theme.ts`)

Tiny hook with localStorage persistence. Default `ink`. Civilian + landing don't expose a toggle — switching modes mid-emergency is jarring.

---

## 19. Bug fixes / hardening done in this session ★ new

Captured here so I don't redo them.

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Dashboard showed 0 ambulances, "Loading…" never resolved | Supabase free project auto-paused | User resumed in Supabase dashboard |
| 2 | Sidebar status badge showed "Processing" with spinner for `en_route`/`returning` | `STATUS_CONFIG` only covered 7 of 10 statuses | Added `en_route`, `on_scene`, `returning` entries |
| 3 | Route polyline shown during `returning` state, looking like ambulance was reversing | Picked any incident with waypoints regardless of status | `ROUTE_DISPLAY_STATUSES` filter restricts to `dispatched`/`en_route`/`on_scene` |
| 4 | Route line vanished after the first simulate/step UPDATE | Postgres TOAST + Supabase Realtime: unchanged TOASTed columns omitted from UPDATE payload, full-row replace nuked `route_waypoints` | `mergeIncident` helper preserves null/undefined values from prior state |
| 5 | "Connecting… Waiting for Civilian" forever after accept | Single-shot WebRTC offer was lost when institution subscribed late; Supabase Broadcast doesn't buffer | Civilian re-broadcasts the offer every 2s until answered; cancels on `connected`/`failed`/`closed` |
| 6 | Same VoiceChat broke in dev only — `Channel CLOSED` right after `SUBSCRIBED` | React StrictMode's intentional double-mount tore down the Supabase channel mid-handshake; same topic name from same client = shared server-side subscription | `reactStrictMode: false` in `next.config.mjs` (dev-only protection; prod never double-mounts) |
| 7 | Map left a black dead area below the rendered tiles | MapLibre's canvas didn't auto-resize when its container box grew | `ResizeObserver` → `requestAnimationFrame(() => map.resize())` |
| 8 | Theme toggle didn't change the basemap | Map init effect ran once on mount, never reacted to `theme` prop | New effect on `[theme, mapStyles, isLoaded]` calls `map.setStyle()` |
| 9 | Route polyline disappeared after every theme swap | `setStyle({ diff: false })` wipes user-added layers (markers survive — DOM elements) | Added `styleVersion` counter to MapContext; `MapRoute` re-attaches its source + layer when it bumps |
| 10 | `MapFitBounds` only fit once per mount | `fitted.current = true` set forever | Re-fit when route's start/end key changes; ignore mid-route progress updates |

---

(Last updated after the A\* broker integration, the UI revamp, and the realtime/WebRTC hardening pass.)
