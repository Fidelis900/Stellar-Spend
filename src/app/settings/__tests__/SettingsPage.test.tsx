import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SettingsPage from '../page';
import { I18nProvider } from '@/lib/i18n/provider';

// Mock hooks
const mockSetTheme = vi.fn((t) => localStorage.setItem('theme', t));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: localStorage.getItem('theme') || 'system',
    setTheme: mockSetTheme,
  }),
}));

describe('SettingsPage Persistence', () => {
  it('should change language and persist', async () => {
    // This is more of a component test, but we can verify the UI responds
    render(
      <I18nProvider>
        <SettingsPage />
      </I18nProvider>,
    );

    // Switch to preferences tab
    const prefTab = screen.getByText(/PREFERENCES/i);
    fireEvent.click(prefTab);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'es' } });

    expect(localStorage.getItem('stellar_language')).toBe('es');
  });

  it('should reset to defaults', () => {
    localStorage.setItem('stellar_language', 'es');
    localStorage.setItem('theme', 'dark');

    render(
      <I18nProvider>
        <SettingsPage />
      </I18nProvider>,
    );

    // Should find the button even if it's in Spanish because of the regex or by role
    const buttons = screen.getAllByRole('button');
    const resetButton = buttons.find(
      (b) => b.textContent?.includes('Restablecer') || b.textContent?.includes('Reset'),
    );

    if (resetButton) fireEvent.click(resetButton);

    expect(localStorage.getItem('stellar_language')).toBe('en');
    expect(localStorage.getItem('theme')).toBe('system');
  });
});
