'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight, Phone, Radio, Activity, MapPin, Clock } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { MonoTag, Eyebrow } from '@/components/ui/typography';

const WaastaMap = dynamic(() => import('@/components/maps/WaastaMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#0e0e10]" />,
});

// Mock ticker — gives the landing a live operator-room feel
const TICKER_FEED = [
  { time: '00:42', kind: 'MEDICAL',   place: 'NIPA CHOWRANGI',  state: 'DISPATCHED' },
  { time: '01:08', kind: 'ACCIDENT',  place: 'DO DARYA',         state: 'EN ROUTE'  },
  { time: '01:31', kind: 'FIRE',      place: 'CLIFTON BRIDGE',   state: 'ON SCENE'  },
  { time: '02:04', kind: 'MEDICAL',   place: 'TARIQ ROAD',       state: 'RESOLVED'  },
  { time: '02:19', kind: 'CRIME',     place: 'KORANGI CROSSING', state: 'DISPATCHED'},
  { time: '02:55', kind: 'MEDICAL',   place: 'LUCKY ONE MALL',   state: 'EN ROUTE'  },
];

// Faux-route waypoints for the hero map (DHA → Gulshan, ~realistic)
const HERO_ROUTE: [number, number][] = [
  [24.8030, 67.0570], [24.8120, 67.0610], [24.8210, 67.0680], [24.8330, 67.0720],
  [24.8480, 67.0760], [24.8590, 67.0800], [24.8720, 67.0840], [24.8860, 67.0880],
  [24.9010, 67.0905], [24.9120, 67.0925], [24.9204, 67.0932],
];

export default function Home() {
  return (
    <main className="surface-paper relative min-h-screen w-full overflow-hidden">
      <DotMatrixOverlay />

      {/* ── TICKER (top) ────────────────────────────────────── */}
      <Ticker />

      {/* ── MASTHEAD ────────────────────────────────────────── */}
      <header className="relative z-20 mx-auto flex max-w-[1600px] items-center justify-between px-6 pt-7 md:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="relative h-10 w-10">
            <Image src="/logoBackgroundRemoved.png" alt="" fill sizes="40px" className="object-contain" priority />
          </div>
          <div className="leading-none">
            <span
              className="font-display text-[22px] font-semibold tracking-[-0.02em]"
              style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}
            >
              Waasta
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <MonoTag size="xs" className="opacity-60">/ Brief</MonoTag>
          <MonoTag size="xs" className="opacity-60">/ Stack</MonoTag>
          <MonoTag size="xs" className="opacity-60">/ Edhi · Chhipa · Aman</MonoTag>
        </nav>

        <LiveClock />
      </header>

      {/* ── HERO: split editorial ────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-[1600px] px-6 pt-10 md:px-12 md:pt-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
          {/* LEFT — typography */}
          <div className="lg:col-span-7">
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
            >
              <motion.div variants={fadeUp} className="mb-6 flex items-center gap-3">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: 'var(--action)', boxShadow: '0 0 0 4px rgba(234,88,12,0.18)' }}
                />
                <Eyebrow number={1}>Live · Karachi · Right now</Eyebrow>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="font-display font-medium text-balance"
                style={{
                  fontSize: 'clamp(3.2rem, 9.5vw, 8.5rem)',
                  lineHeight: '0.86',
                  letterSpacing: '-0.045em',
                  fontVariationSettings: '"opsz" 144, "SOFT" 30',
                }}
              >
                When<br />
                <span
                  className="italic"
                  style={{
                    color: 'var(--action)',
                    fontVariationSettings: '"opsz" 144, "SOFT" 100',
                  }}
                >
                  seconds
                </span>{' '}
                matter,<br />
                Waasta listens.
              </motion.h1>

              <motion.div
                variants={fadeUp}
                className="mt-9 grid max-w-[640px] grid-cols-2 gap-7 md:grid-cols-3"
              >
                <Stat value="≤ 30" unit="sec" label="AI triage" />
                <Stat value="≤ 3" unit="min" label="OSRM route" />
                <Stat value="$0" unit="∕mo" label="Stack cost" />
              </motion.div>

              <motion.p
                variants={fadeUp}
                className="mt-9 max-w-[52ch] text-[15px] leading-[1.55] text-[color:var(--paper-ink-soft)]"
              >
                An AI dispatcher that listens in Urdu and Roman Urdu, finds the nearest
                ambulance, and connects you to a real human in the war room — over WebRTC,
                no phone lines.
              </motion.p>

              <motion.p
                variants={fadeUp}
                className="mt-3 font-display text-[20px] italic text-[color:var(--paper-ink-soft)] tracking-[-0.01em]"
                style={{ fontVariationSettings: '"opsz" 60, "SOFT" 100' }}
              >
                &ldquo;Madad raasta mein hai.&rdquo;
              </motion.p>

              {/* Two oversized CTAs as type-led tiles */}
              <motion.div variants={fadeUp} className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CivilianCTA />
                <OperatorCTA />
              </motion.div>
            </motion.div>
          </div>

          {/* RIGHT — live mini-map preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            className="lg:col-span-5"
          >
            <HeroMapCard />
          </motion.div>
        </div>
      </section>

      {/* ── MISSION-CONTROL FOOTER ────────────────────────── */}
      <MissionFooter />
    </main>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.2, 0.8, 0.2, 1] } },
};

// ============================================================
// Big stat slab — Fraunces numeric + mono unit + caption
// ============================================================
function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-[color:var(--paper-ink)]/15 pl-4">
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-display font-semibold leading-none tabular-nums"
          style={{
            fontSize: 'clamp(2rem, 3.5vw, 2.8rem)',
            letterSpacing: '-0.03em',
            fontVariationSettings: '"opsz" 96, "SOFT" 30',
          }}
        >
          {value}
        </span>
        <MonoTag size="sm" className="opacity-55">{unit}</MonoTag>
      </div>
      <MonoTag size="xs" className="opacity-50">{label}</MonoTag>
    </div>
  );
}

// ============================================================
// Civilian CTA — paper card with big serif label
// ============================================================
function CivilianCTA() {
  return (
    <Link href="/civilian" className="group block">
      <article className="relative overflow-hidden border border-[color:var(--paper-ink)]/15 bg-white/65 p-5 backdrop-blur-[2px] transition-all duration-300 hover:bg-white hover:border-[color:var(--action)]/45 hover:shadow-[0_22px_60px_-22px_rgba(28,24,20,0.28)]">
        <div className="flex items-start justify-between">
          <Eyebrow number="A">For Civilians</Eyebrow>
          <ArrowUpRight className="h-4 w-4 opacity-30 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
        </div>
        <div className="mt-7">
          <span
            className="font-display text-[28px] font-semibold tracking-[-0.025em] leading-[1]"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}
          >
            Tap.
          </span>{' '}
          <span
            className="font-display text-[28px] font-semibold tracking-[-0.025em] leading-[1] italic"
            style={{ color: 'var(--action)', fontVariationSettings: '"opsz" 96, "SOFT" 100' }}
          >
            Speak.
          </span>{' '}
          <span
            className="font-display text-[28px] font-semibold tracking-[-0.025em] leading-[1]"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}
          >
            Live.
          </span>
        </div>
        <div className="mt-5 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--action)]">
            <Phone className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
          </span>
          <MonoTag size="sm" className="opacity-70">SOS · Voice + Text</MonoTag>
        </div>
      </article>
    </Link>
  );
}

// ============================================================
// Operator CTA — ink-dark card, preview of dashboard mood
// ============================================================
function OperatorCTA() {
  return (
    <Link href="/institution/dashboard" className="group block">
      <article className="relative overflow-hidden border border-[color:var(--paper-ink)] bg-[color:var(--paper-ink)] p-5 text-[color:var(--paper-bg)] transition-all duration-300 hover:shadow-[0_22px_60px_-22px_rgba(28,24,20,0.55)]">
        {/* Scanning line on hover */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[color:var(--action)]/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        {/* Subtle radial glow */}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-30 blur-2xl" style={{ background: 'var(--action)' }} />
        <div className="relative flex items-start justify-between">
          <Eyebrow number="B" className="text-[color:var(--paper-bg)]/80">For Operators</Eyebrow>
          <ArrowUpRight className="h-4 w-4 opacity-50 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
        </div>
        <div className="relative mt-7">
          <span
            className="font-display text-[28px] font-semibold tracking-[-0.025em] leading-[1] text-[color:var(--paper-bg)]"
            style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}
          >
            Live war room.
          </span>
        </div>
        <div className="relative mt-5 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--paper-bg)]/35">
            <Radio className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
          <MonoTag size="sm" className="opacity-65">Broadcast · Dispatch · Track</MonoTag>
        </div>
      </article>
    </Link>
  );
}

// ============================================================
// Hero map card — ink-themed mini map with the route already drawn
// ============================================================
function HeroMapCard() {
  return (
    <div className="surface-ink relative aspect-[4/5] w-full overflow-hidden border border-[color:var(--paper-ink)]/20 lg:aspect-auto lg:h-[640px]">
      {/* Frame chrome — corner ticks */}
      <span aria-hidden className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[color:var(--action)] opacity-80" />
      <span aria-hidden className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-[color:var(--action)] opacity-80" />
      <span aria-hidden className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-[color:var(--action)] opacity-80" />
      <span aria-hidden className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-[color:var(--action)] opacity-80" />

      {/* Map */}
      <div className="absolute inset-[6px]">
        <WaastaMap
          center={{ lat: 24.86, lng: 67.07 }}
          zoom={10.6}
          theme="ink"
          interactive={false}
          markers={[
            { lat: 24.8030, lng: 67.0570, iconType: 'deployed', iconName: 'ambulance', popup: 'EDH-02' },
            { lat: 24.9204, lng: 67.0932, iconType: 'offline', iconName: 'incident', popup: 'Medical · Nipa Chowrangi' },
            { lat: 24.8615, lng: 67.0542, iconType: 'institute', iconName: 'hospital', popup: 'Edhi Foundation' },
          ]}
          routeWaypoints={HERO_ROUTE}
          routeProgressStep={6}
        />
      </div>

      {/* HUD overlay top */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--action)]" />
        <MonoTag size="xs" className="text-[color:var(--ink-fg-soft)]">REC · 24.86°N 67.07°E</MonoTag>
      </div>
      <div className="pointer-events-none absolute right-3 top-3">
        <MonoTag size="xs" className="text-[color:var(--ink-fg-soft)]">ZOOM 10.6 · KARACHI</MonoTag>
      </div>

      {/* HUD overlay bottom — incident card */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3">
        <div className="flex items-end justify-between border border-[color:var(--ink-line)] bg-[color:var(--ink-bg-2)]/85 p-3 backdrop-blur-sm">
          <div>
            <MonoTag size="xs" className="text-[color:var(--action)]">INCIDENT 0042 · LIVE</MonoTag>
            <div className="mt-1.5 font-display text-[18px] font-semibold leading-tight text-[color:var(--ink-fg)]" style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}>
              Medical · Nipa Chowrangi
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--ink-fg-soft)]">EDH-02 dispatched — ETA 04:12</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <MonoTag size="xs" className="text-[color:var(--ink-fg-muted)]">SEVERITY</MonoTag>
            <div className="flex h-5 items-end gap-[3px]">
              <span className="w-[3px] rounded-[1px]" style={{ height: '25%', background: 'var(--sev-low)' }} />
              <span className="w-[3px] rounded-[1px]" style={{ height: '40%', background: 'var(--sev-low)' }} />
              <span className="w-[3px] rounded-[1px]" style={{ height: '60%', background: 'var(--sev-mid)' }} />
              <span className="w-[3px] rounded-[1px]" style={{ height: '80%', background: 'var(--sev-high)' }} />
              <span className="w-[3px] rounded-[1px] opacity-20" style={{ height: '100%', background: 'currentColor', color: 'var(--ink-fg)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Top scrolling ticker
// ============================================================
function Ticker() {
  return (
    <div className="relative z-30 overflow-hidden border-b border-[color:var(--paper-line)] bg-[color:var(--paper-ink)] py-2 text-[color:var(--paper-bg)]">
      <div className="flex animate-[ticker_40s_linear_infinite] items-center gap-12 whitespace-nowrap">
        {[...TICKER_FEED, ...TICKER_FEED, ...TICKER_FEED].map((it, i) => (
          <div key={i} className="flex shrink-0 items-center gap-3">
            <MonoTag size="xs" className="opacity-50">{it.time}</MonoTag>
            <span
              className="h-1 w-1 rounded-full"
              style={{ background: it.state === 'RESOLVED' ? 'var(--status-ok)' : 'var(--action)' }}
            />
            <MonoTag size="xs">{it.kind}</MonoTag>
            <MonoTag size="xs" className="opacity-65">{it.place}</MonoTag>
            <MonoTag size="xs" className="text-[color:var(--action-soft)]">→ {it.state}</MonoTag>
          </div>
        ))}
      </div>
      <style jsx>{`
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Live local time — updates every second
// ============================================================
function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="hidden md:block" style={{ width: 110 }} />;

  const time = now.toLocaleTimeString('en-GB', { hour12: false });
  return (
    <div className="hidden flex-col items-end gap-0.5 md:flex">
      <MonoTag size="md" className="tabular-nums">{time}</MonoTag>
      <MonoTag size="xs" className="opacity-50">PKT · KHI</MonoTag>
    </div>
  );
}

// ============================================================
// Mission-control footer — fixed at bottom, status bar
// ============================================================
function MissionFooter() {
  return (
    <footer className="relative z-10 mx-auto mt-20 max-w-[1600px] px-6 pb-10 md:px-12">
      <div className="rule-paper grid grid-cols-2 gap-y-3 pt-5 md:grid-cols-4">
        <FooterCell icon={<Activity className="h-3 w-3" />} label="STATUS"   value="ALL SYSTEMS NOMINAL" valueColor="var(--status-ok)" />
        <FooterCell icon={<Radio className="h-3 w-3" />}    label="REALTIME" value="SUPABASE · WSS"      />
        <FooterCell icon={<MapPin className="h-3 w-3" />}   label="ROUTING"  value="OSRM · ROAD"          />
        <FooterCell icon={<Clock className="h-3 w-3" />}    label="STACK"    value="LANGGRAPH · GROQ · WEBRTC" />
      </div>
      <div className="rule-paper mt-5 flex items-baseline justify-between pt-3">
        <MonoTag size="xs" className="opacity-50">© 2026 · Built in 24h · AI Mustaqbil 2.0</MonoTag>
        <MonoTag size="xs" className="opacity-50">v 2.0 · مرحبا کراچی</MonoTag>
      </div>
    </footer>
  );
}

function FooterCell({
  icon, label, value, valueColor,
}: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="opacity-60">{icon}</span>
      <div className="flex flex-col">
        <MonoTag size="xs" className="opacity-40">{label}</MonoTag>
        <MonoTag size="xs" className="font-semibold" style={valueColor ? { color: valueColor } : undefined}>
          {value}
        </MonoTag>
      </div>
    </div>
  );
}

// ============================================================
// Subtle dot-matrix overlay over the entire paper
// ============================================================
function DotMatrixOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.07]"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, var(--paper-ink) 1px, transparent 0)',
        backgroundSize: '18px 18px',
      }}
    />
  );
}
