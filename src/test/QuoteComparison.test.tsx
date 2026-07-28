import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QuoteComparison, type ProviderQuote } from '@/components/QuoteComparison';

const noop = vi.fn();

const mockQuotes: ProviderQuote[] = [
  {
    id: 'paycrest',
    provider: 'Paycrest',
    rate: 1600,
    bridgeFee: '0.50',
    payoutFee: '0.00',
    totalFee: '0.50',
    estimatedTime: 300,
    destinationAmount: '159500.00',
    currency: 'NGN',
    rating: 5,
    badge: 'Best Rate',
  },
  {
    id: 'yellowcard',
    provider: 'Yellow Card',
    rate: 1587,
    bridgeFee: '0.80',
    payoutFee: '0.50',
    totalFee: '1.30',
    estimatedTime: 180,
    destinationAmount: '158200.00',
    currency: 'NGN',
    rating: 4,
    badge: 'Fastest',
  },
];

describe('QuoteComparison', () => {
  it('renders nothing when quotes array is empty', () => {
    const { container } = render(
      <QuoteComparison quotes={[]} selectedId={undefined} onSelect={noop} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a row for each provider', () => {
    render(<QuoteComparison quotes={mockQuotes} selectedId="paycrest" onSelect={noop} />);
    expect(screen.getByText('Paycrest')).toBeInTheDocument();
    expect(screen.getByText('Yellow Card')).toBeInTheDocument();
  });

  it('renders provider badges', () => {
    render(<QuoteComparison quotes={mockQuotes} selectedId="paycrest" onSelect={noop} />);
    // "Best Rate" appears as both a sort button and a badge span — at least 2 occurrences
    expect(screen.getAllByText('Best Rate').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Fastest').length).toBeGreaterThanOrEqual(2);
  });

  it('calls onSelect with provider id when row is clicked', async () => {
    const onSelect = vi.fn();
    render(<QuoteComparison quotes={mockQuotes} selectedId="paycrest" onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Yellow Card').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith('yellowcard');
  });

  it('marks selected row with aria-pressed=true', () => {
    render(<QuoteComparison quotes={mockQuotes} selectedId="paycrest" onSelect={noop} />);
    const buttons = screen.getAllByRole('button', { pressed: true });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('Paycrest');
  });

  it('shows skeleton rows when isLoading is true', () => {
    const { container } = render(
      <QuoteComparison quotes={mockQuotes} selectedId="paycrest" onSelect={noop} isLoading />,
    );
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders sort controls', () => {
    render(<QuoteComparison quotes={mockQuotes} selectedId="paycrest" onSelect={noop} />);
    // Sort buttons exist (may share text with badges)
    expect(screen.getAllByText('Best Rate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Lowest Fee')).toBeInTheDocument();
    expect(screen.getAllByText('Fastest').length).toBeGreaterThanOrEqual(1);
  });

  it('sorts by fee when Lowest Fee sort is clicked', async () => {
    render(<QuoteComparison quotes={mockQuotes} selectedId="paycrest" onSelect={noop} />);
    await userEvent.click(screen.getByRole('button', { name: /lowest fee/i }));
    const rows = screen.getAllByRole('button', { pressed: false });
    // After sorting by fee, Paycrest (0.50) should appear before Yellow Card (1.30)
    const providerNames = rows.map((r) => r.textContent);
    const paycrestIdx = providerNames.findIndex((t) => t?.includes('Paycrest'));
    const yellowIdx = providerNames.findIndex((t) => t?.includes('Yellow Card'));
    expect(paycrestIdx).toBeLessThan(yellowIdx);
  });
});
