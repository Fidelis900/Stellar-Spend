import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SharePreview } from '@/components/SharePreview';

describe('SharePreview', () => {
  it('renders the public-facing transaction summary without bank details', () => {
    render(
      <SharePreview
        preview={{
          transactionId: 'tx-1',
          amount: '100',
          currency: 'NGN',
          status: 'completed',
          timestamp: Date.now(),
        }}
      />,
    );

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.queryByText(/bank/i)).not.toBeInTheDocument();
  });
});
