import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ProgressSteps from '@/components/ProgressSteps';

describe('ProgressSteps', () => {
  it('shows CONNECT WALLET when not connected', () => {
    render(<ProgressSteps isConnected={false} isConnecting={false} />);
    expect(screen.getByText('CONNECT WALLET')).toBeInTheDocument();
  });

  it('shows CONNECTED ✓ when connected', () => {
    render(<ProgressSteps isConnected={true} isConnecting={false} />);
    expect(screen.getByText('CONNECTED ✓')).toBeInTheDocument();
  });

  it('shows SIGNATURE PENDING when connecting', () => {
    render(<ProgressSteps isConnected={false} isConnecting={true} />);
    expect(screen.getByText('SIGNATURE PENDING')).toBeInTheDocument();
  });

  it('active step has gold background class when not connected', () => {
    const { container } = render(<ProgressSteps isConnected={false} isConnecting={false} />);
    const step1 = screen.getByText('CONNECT WALLET').closest("div[class*='p-6']");
    expect(step1?.className).toContain('bg-[#c9a962]');
  });

  it('active step has gold background class when connecting', () => {
    const { container } = render(<ProgressSteps isConnected={false} isConnecting={true} />);
    const step2 = screen.getByText('SIGNATURE PENDING').closest("div[class*='p-6']");
    expect(step2?.className).toContain('bg-[#c9a962]');
  });

  it('active step has gold background class when connected', () => {
    const { container } = render(<ProgressSteps isConnected={true} isConnecting={false} />);
    const step3 = screen.getByText('₦ PAYOUT').closest("div[class*='p-6']");
    expect(step3?.className).toContain('bg-[#c9a962]');
  });

  it('always renders all 3 steps', () => {
    render(<ProgressSteps isConnected={false} isConnecting={false} />);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
  });
});
