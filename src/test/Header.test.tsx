import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/Header';
import { ToastProvider } from '@/contexts/ToastContext';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const baseProps = {
  subtitle: 'Test subtitle',
  isConnected: false,
  isConnecting: false,
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
};

function renderHeader(props: Partial<typeof baseProps> & Record<string, unknown> = {}) {
  return render(
    <ToastProvider>
      <Header {...baseProps} {...props} />
    </ToastProvider>,
  );
}

describe('Header — wallet button', () => {
  it('renders CONNECT WALLET button when disconnected', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });

  it('renders truncated address when connected', () => {
    renderHeader({ isConnected: true, walletAddress: 'GCFXABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890' });
    const button = screen.getByRole('button', { name: /disconnect wallet/i });
    expect(button.textContent).toMatch(/GCFX/);
  });

  it('renders CONNECTING... when connecting', () => {
    renderHeader({ isConnecting: true });
    expect(screen.getByRole('button', { name: /connect wallet/i })).toHaveTextContent(
      'CONNECTING...',
    );
  });

  it('shows balance lines when connected', () => {
    renderHeader({
      isConnected: true,
      walletAddress: 'GCFX1234',
      stellarUsdcBalance: '100.00',
      stellarXlmBalance: '50.00',
    });
    expect(screen.getByText(/100\.00 USDC/)).toBeInTheDocument();
    expect(screen.getByText(/50\.00 XLM/)).toBeInTheDocument();
  });

  it('calls onConnect when button clicked (disconnected state)', async () => {
    const onConnect = vi.fn();
    renderHeader({ onConnect });
    await userEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('calls onDisconnect when button clicked (connected state)', async () => {
    const onDisconnect = vi.fn();
    renderHeader({ isConnected: true, walletAddress: 'GCFX1234', onDisconnect });
    await userEvent.click(screen.getByRole('button', { name: /disconnect wallet/i }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('button is disabled when isConnecting', () => {
    renderHeader({ isConnecting: true });
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeDisabled();
  });
});

describe('Header — balance skeleton', () => {
  it('does not render balance rows when disconnected', () => {
    renderHeader();
    expect(screen.queryByText(/USDC/)).not.toBeInTheDocument();
  });

  it('renders actual balance values when loaded', () => {
    renderHeader({
      isConnected: true,
      isBalanceLoading: false,
      stellarUsdcBalance: '1,250.00',
      stellarXlmBalance: '42.50',
      walletAddress: 'GCFX1234',
    });
    expect(screen.getByText(/1,250\.00 USDC/)).toBeInTheDocument();
    expect(screen.getByText(/42\.50 XLM/)).toBeInTheDocument();
  });

  it("shows fallback '—' when balances are null after loading", () => {
    renderHeader({
      isConnected: true,
      isBalanceLoading: false,
      stellarUsdcBalance: null,
      stellarXlmBalance: null,
      walletAddress: 'GCFX1234',
    });
    expect(screen.getByText(/— USDC/)).toBeInTheDocument();
    expect(screen.getByText(/— XLM/)).toBeInTheDocument();
  });

  it('shows CONNECTING... label while isConnecting', () => {
    renderHeader({ isConnecting: true });
    expect(screen.getByRole('button', { name: /connect wallet/i })).toHaveTextContent(
      'CONNECTING...',
    );
  });

  it('button is disabled while connecting', () => {
    renderHeader({ isConnecting: true });
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeDisabled();
  });
});
