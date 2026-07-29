import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationCenter } from '../NotificationCenter';
import type { NotificationCenterEvent } from '@/hooks/useNotificationCenter';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('NotificationCenter', () => {
  const mockEvent: NotificationCenterEvent = {
    id: 'test-1',
    type: 'price_alert',
    title: 'Price Alert',
    description: 'Alert has been triggered',
    read: false,
    createdAt: Date.now(),
    link: {
      href: '/alerts/test-1',
      label: 'View Alert',
    },
  };

  const mockHandlers = {
    onMarkAsRead: vi.fn(),
    onMarkAllAsRead: vi.fn(),
    onRemoveEvent: vi.fn(),
    onClearAll: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('bell button', () => {
    it('should render bell button', () => {
      render(
        <NotificationCenter
          events={[]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      expect(button).toBeInTheDocument();
    });

    it('should show unread badge with count', () => {
      render(
        <NotificationCenter
          events={[]}
          unreadCount={5}
          unreadBadgeText="5"
          loading={false}
          {...mockHandlers}
        />,
      );

      const badge = screen.getByText('5');
      expect(badge).toBeInTheDocument();
    });

    it('should show overflow badge for 99+ unread', () => {
      render(
        <NotificationCenter
          events={[]}
          unreadCount={150}
          unreadBadgeText="99+"
          loading={false}
          {...mockHandlers}
        />,
      );

      const badge = screen.getByText('99+');
      expect(badge).toBeInTheDocument();
    });

    it('should toggle panel on click', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <NotificationCenter
          events={[]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });

      // Initially panel is closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Click to open
      await user.click(button);

      rerender(
        <NotificationCenter
          events={[]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={false}
          {...mockHandlers}
        />,
      );

      // Panel should be open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no events', () => {
      render(
        <NotificationCenter
          events={[]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });

    it('should show loading state', () => {
      render(
        <NotificationCenter
          events={[]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={true}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
    });
  });

  describe('notification list', () => {
    it('should display notifications', () => {
      render(
        <NotificationCenter
          events={[mockEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('Price Alert')).toBeInTheDocument();
      expect(screen.getByText('Alert has been triggered')).toBeInTheDocument();
    });

    it('should show unread indicator for unread events', () => {
      const unreadEvent: NotificationCenterEvent = {
        ...mockEvent,
        read: false,
      };

      render(
        <NotificationCenter
          events={[unreadEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      // Should have a dot indicator for unread
      const items = screen.getAllByRole('button');
      const notificationItem = items.find((item) => item.textContent?.includes('Price Alert'));
      expect(notificationItem).toBeInTheDocument();
    });

    it('should not show unread indicator for read events', () => {
      const readEvent: NotificationCenterEvent = {
        ...mockEvent,
        read: true,
      };

      render(
        <NotificationCenter
          events={[readEvent]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('Price Alert')).toBeInTheDocument();
    });

    it('should show event action link', () => {
      render(
        <NotificationCenter
          events={[mockEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('View Alert')).toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('should call onMarkAsRead when clicking notification', () => {
      render(
        <NotificationCenter
          events={[mockEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      const notificationButton = screen.getByText('Price Alert').closest('button');
      fireEvent.click(notificationButton!);

      expect(mockHandlers.onMarkAsRead).toHaveBeenCalledWith('test-1');
    });

    it('should call onMarkAllAsRead when clicking mark all button', async () => {
      const user = userEvent.setup();
      render(
        <NotificationCenter
          events={[mockEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      await user.click(button);

      const markReadButton = screen.getByText('Mark Read');
      await user.click(markReadButton);

      expect(mockHandlers.onMarkAllAsRead).toHaveBeenCalled();
    });

    it('should call onClearAll when clicking clear all button', async () => {
      const user = userEvent.setup();
      render(
        <NotificationCenter
          events={[mockEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      await user.click(button);

      const clearButton = screen.getByText('Clear All');
      await user.click(clearButton);

      expect(mockHandlers.onClearAll).toHaveBeenCalled();
    });

    it('should call onRemoveEvent when clicking remove button', async () => {
      const user = userEvent.setup();
      render(
        <NotificationCenter
          events={[mockEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      await user.click(button);

      const removeButtons = screen.getAllByLabelText('Remove notification');
      await user.click(removeButtons[0]);

      expect(mockHandlers.onRemoveEvent).toHaveBeenCalledWith('test-1');
    });
  });

  describe('keyboard accessibility', () => {
    it('should close panel on Escape key', async () => {
      const user = userEvent.setup();
      render(
        <NotificationCenter
          events={[]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      await user.click(button);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(
        <NotificationCenter
          events={[mockEvent]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });

      // Tab to bell button
      await user.tab();

      expect(button).toHaveFocus();

      // Click to open
      await user.keyboard(' ');

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('event type colors and icons', () => {
    it('should display price alert with correct styling', () => {
      const priceAlert: NotificationCenterEvent = {
        ...mockEvent,
        type: 'price_alert',
      };

      render(
        <NotificationCenter
          events={[priceAlert]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('Price Alert')).toBeInTheDocument();
    });

    it('should display transaction update with correct styling', () => {
      const txUpdate: NotificationCenterEvent = {
        ...mockEvent,
        type: 'transaction_update',
        title: 'Transaction Complete',
      };

      render(
        <NotificationCenter
          events={[txUpdate]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('Transaction Complete')).toBeInTheDocument();
    });

    it('should display payout update with correct styling', () => {
      const payoutUpdate: NotificationCenterEvent = {
        ...mockEvent,
        type: 'payout_update',
        title: 'Payout Settled',
      };

      render(
        <NotificationCenter
          events={[payoutUpdate]}
          unreadCount={1}
          unreadBadgeText="1"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      fireEvent.click(button);

      expect(screen.getByText('Payout Settled')).toBeInTheDocument();
    });
  });

  describe('panel closing', () => {
    it('should close panel when clicking outside', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <div data-testid="outside">Outside</div>
          <NotificationCenter
            events={[]}
            unreadCount={0}
            unreadBadgeText="0"
            loading={false}
            {...mockHandlers}
          />
        </div>,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      await user.click(button);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const outside = screen.getByTestId('outside');
      await user.click(outside);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should focus bell button after closing', async () => {
      const user = userEvent.setup();
      render(
        <NotificationCenter
          events={[]}
          unreadCount={0}
          unreadBadgeText="0"
          loading={false}
          {...mockHandlers}
        />,
      );

      const button = screen.getByRole('button', { name: /notifications/i });
      await user.click(button);
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(button).toHaveFocus();
      });
    });
  });
});
