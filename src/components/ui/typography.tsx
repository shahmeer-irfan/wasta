'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// ============================================================
// Editorial display headline — Fraunces, optical-sized, tight tracking
// ============================================================
export function Display({
  children, className, level = 1,
}: {
  children: React.ReactNode;
  className?: string;
  level?: 1 | 2 | 3;
}) {
  const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1';
  const size =
    level === 1 ? 'text-[clamp(2.4rem,5vw,4.2rem)] leading-[0.95]' :
    level === 2 ? 'text-[clamp(1.7rem,3.5vw,2.6rem)] leading-[1.02]' :
                  'text-[clamp(1.15rem,2vw,1.5rem)] leading-[1.1]';
  return (
    <Tag
      className={cn(
        'font-display font-medium tracking-[-0.025em] text-balance',
        size,
        className,
      )}
      style={{ fontVariationSettings: '"opsz" 96, "SOFT" 30' }}
    >
      {children}
    </Tag>
  );
}

// ============================================================
// Mono-tagged identifier — call signs, IDs, coords, ETAs
// ============================================================
export function MonoTag({
  children, className, size = 'sm',
}: {
  children: React.ReactNode;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}) {
  const sizes = {
    xs: 'text-[9.5px] tracking-[0.08em]',
    sm: 'text-[10.5px] tracking-[0.06em]',
    md: 'text-[12px] tracking-[0.04em]',
  };
  return (
    <span className={cn('font-mono-tabular uppercase', sizes[size], className)}>
      {children}
    </span>
  );
}

// ============================================================
// Numeric stat — big numbers (count, ETA, distance) in Fraunces
// ============================================================
export function NumericStat({
  value, label, accent, className,
}: {
  value: React.ReactNode;
  label?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span
        className={cn(
          'font-display font-semibold leading-none text-[clamp(2.2rem,4vw,3rem)] tracking-[-0.03em] tabular-nums',
          accent && 'text-[color:var(--action)]',
        )}
        style={{ fontVariationSettings: '"opsz" 96' }}
      >
        {value}
      </span>
      {label && (
        <MonoTag className="text-current/55" size="xs">
          {label}
        </MonoTag>
      )}
    </div>
  );
}

// ============================================================
// Status underline — replaces pill badges. Newspaper-deck style.
// 2px coloured underline beneath a single word.
// ============================================================
const STATUS_COLORS = {
  ok:        'var(--status-ok)',
  route:     'var(--status-route)',
  alert:     'var(--status-alert)',
  amber:     'var(--status-amber)',
  action:    'var(--action)',
  neutral:   'var(--paper-ink-muted)',
} as const;

export function StatusUnderline({
  children, kind = 'neutral', className, animated = true,
}: {
  children: React.ReactNode;
  kind?: keyof typeof STATUS_COLORS;
  className?: string;
  animated?: boolean;
}) {
  return (
    <span className={cn('inline-flex flex-col items-start gap-[3px]', className)}>
      <span className="font-mono-tabular text-[10px] uppercase tracking-[0.12em] leading-none">
        {children}
      </span>
      <span
        aria-hidden
        className={cn(
          'h-[2px] w-full origin-left rounded-full',
          animated && 'animate-[underline-grow_400ms_ease-out_forwards]',
        )}
        style={{ background: STATUS_COLORS[kind] }}
      />
    </span>
  );
}

// ============================================================
// Severity meter — vertical equalizer (1-5 bars)
// ============================================================
export function SeverityBars({
  severity, className,
}: {
  severity: number; // 1-5
  className?: string;
}) {
  const colors = [
    'var(--sev-low)',
    'var(--sev-low)',
    'var(--sev-mid)',
    'var(--sev-high)',
    'var(--sev-life)',
  ];
  const heights = ['25%', '40%', '60%', '80%', '100%'];

  return (
    <div
      className={cn('flex h-5 items-end gap-[3px]', className)}
      title={`Severity ${severity}/5`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const lit = i <= severity;
        return (
          <span
            key={i}
            className={cn(
              'w-[3px] rounded-[1px] transition-all',
              lit ? '' : 'opacity-20',
            )}
            style={{
              height: heights[i - 1],
              background: lit ? colors[severity - 1] : 'currentColor',
            }}
          />
        );
      })}
    </div>
  );
}

// ============================================================
// Section eyebrow — tiny mono caps "section №" header
// ============================================================
export function Eyebrow({
  number, children, className,
}: {
  number?: string | number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline gap-2 font-mono-tabular', className)}>
      {number !== undefined && (
        <span className="text-[10px] opacity-50 tabular-nums">№ {String(number).padStart(2, '0')}</span>
      )}
      <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">{children}</span>
    </div>
  );
}

// ============================================================
// Audio waveform bar — fake-but-evocative meter for voice calls
// ============================================================
export function WaveformBar({
  active = false, className, color,
}: {
  active?: boolean;
  className?: string;
  color?: string;
}) {
  // 24 bars with deterministic but organic-looking heights
  const bars = React.useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const seed = (Math.sin(i * 1.7) + 1) / 2;
      const base = 18 + seed * 64;
      return { base, delay: i * 30 };
    });
  }, []);

  return (
    <div
      className={cn('flex h-6 items-center gap-[3px]', className)}
      style={{ color: color ?? 'var(--action)' }}
    >
      {bars.map((b, i) => (
        <span
          key={i}
          className={cn(
            'w-[2.5px] rounded-full transition-all duration-200',
            active ? 'opacity-90' : 'opacity-25',
          )}
          style={{
            height: `${active ? b.base : 12}%`,
            background: 'currentColor',
            transitionDelay: `${b.delay}ms`,
            animation: active
              ? `heartbeat ${1.2 + (i % 5) * 0.15}s ease-in-out ${b.delay}ms infinite`
              : undefined,
          }}
        />
      ))}
    </div>
  );
}
