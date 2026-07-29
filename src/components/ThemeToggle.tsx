'use client';

import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const getNextTheme = () => {
    if (theme === 'dark') return 'light';
    if (theme === 'light') return 'high-contrast';
    return 'dark';
  };

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle p-2 border border-line hover:border-accent transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      aria-label={`Switch to ${getNextTheme()} mode. Current: ${theme}`}
      title={`Switch to ${getNextTheme()} mode`}
      data-theme-icon={theme}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === 'dark' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 2V4M12 20V22M22 12H20M4 12H2M19.07 4.93L17.66 6.34M6.34 17.66L4.93 19.07M19.07 19.07L17.66 17.66M6.34 6.34L4.93 4.93"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
        {theme === 'light' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {theme === 'high-contrast' && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
              fill="currentColor"
            />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>
        )}
      </span>
    </button>
  );
}
