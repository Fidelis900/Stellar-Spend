'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark' | 'high-contrast';

interface ThemeContextValue {
  theme: Theme;
  isSystem: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  useSystemTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_CYCLE: Theme[] = ['dark', 'light', 'high-contrast'];
const STORAGE_KEY = 'theme';

function resolveSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  if (window.matchMedia('(prefers-contrast: more)').matches) return 'high-contrast';
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'high-contrast' ? stored : null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [isSystem, setIsSystem] = useState<boolean>(true);
  const isMounted = useRef(false);

  useEffect(() => {
    const stored = readStoredTheme();
    const initial = stored ?? resolveSystemTheme();
    setIsSystem(stored === null);
    setThemeState(initial);
    applyTheme(initial, { animate: false });
    isMounted.current = true;
  }, []);

  useEffect(() => {
    if (!isSystem) return;
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const contrast = window.matchMedia('(prefers-contrast: more)');
    const handler = () => {
      const next = resolveSystemTheme();
      setThemeState(next);
      applyTheme(next, { animate: true });
    };
    colorScheme.addEventListener('change', handler);
    contrast.addEventListener('change', handler);
    return () => {
      colorScheme.removeEventListener('change', handler);
      contrast.removeEventListener('change', handler);
    };
  }, [isSystem]);

  function applyTheme(next: Theme, opts: { animate: boolean }) {
    const root = document.documentElement;
    if (!opts.animate) {
      root.classList.add('theme-no-transition');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => root.classList.remove('theme-no-transition'));
      });
    }
    root.setAttribute('data-theme', next);
    root.style.colorScheme = next === 'light' ? 'light' : 'dark';

    if (isMounted.current && navigator.sendBeacon) {
      const payload = JSON.stringify({
        category: 'Accessibility',
        action: 'theme_change',
        label: next,
        timestamp: new Date().toISOString(),
      });
      navigator.sendBeacon(
        '/api/monitoring/vitals',
        new Blob([payload], { type: 'application/json' }),
      );
    }
  }

  const toggleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    localStorage.setItem(STORAGE_KEY, next);
    setIsSystem(false);
    setThemeState(next);
    applyTheme(next, { animate: true });
  };

  const setTheme = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setIsSystem(false);
    setThemeState(next);
    applyTheme(next, { animate: true });
  };

  const useSystemTheme = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsSystem(true);
    const next = resolveSystemTheme();
    setThemeState(next);
    applyTheme(next, { animate: true });
  };

  return (
    <ThemeContext.Provider value={{ theme, isSystem, toggleTheme, setTheme, useSystemTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
