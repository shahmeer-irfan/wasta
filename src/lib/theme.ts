'use client';

// Dashboard-only theme toggle. Civilian + landing always use paper.
// Persists to localStorage so operators keep their preference across sessions.
import { useEffect, useState, useCallback } from 'react';

export type DashboardTheme = 'ink' | 'paper';
const KEY = 'waasta_dash_theme';

export function useDashboardTheme(): {
  theme: DashboardTheme;
  toggle: () => void;
  setTheme: (t: DashboardTheme) => void;
} {
  // SSR-safe default = ink (operator console)
  const [theme, setThemeState] = useState<DashboardTheme>('ink');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as DashboardTheme | null;
      if (stored === 'ink' || stored === 'paper') setThemeState(stored);
    } catch { /* storage unavailable */ }
  }, []);

  const setTheme = useCallback((t: DashboardTheme) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: DashboardTheme = prev === 'ink' ? 'paper' : 'ink';
      try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { theme, toggle, setTheme };
}
