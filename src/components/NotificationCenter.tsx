'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { AsyncBoundary, ListEmptyState, ListLoadingState } from './AsyncBoundary';
import type { NotificationCenterEvent } from '@/hooks/useNotificationCenter';

interface NotificationCenterProps {
  events: NotificationCenterEvent[];
  unreadCount: number;
  unreadBadgeText: string;
  loading: boolean;
  onMarkAsRead: (eventId: string) => void;
  onMarkAllAsRead: () => void;
  onRemoveEvent: (eventId: string) => void;
  onClearAll: () => void;
}

/**
 * NotificationCenter
 * 
 * Bell icon button with dropdown panel showing aggregated notifications.
 * Features:
 * - Bell icon with unread badge
 * - Dropdown panel with scrollable list
 * - Empty state
 * - Overflow state ("99+")
 * - Keyboard accessible (Escape to close, Tab navigation)
 * - Click items to navigate to relevant context
 * - Mark as read/unread
 * - Clear all notifications
 */
export function NotificationCenter({
  events,
  unreadCount,
  unreadBadgeText,
  loading,
  onMarkAsRead,
  onMarkAllAsRead,
  onRemoveEvent,
  onClearAll,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleNotificationClick = (event: NotificationCenterEvent) => {
    // Mark as read
    if (!event.read) {
      onMarkAsRead(event.id);
    }

    // Navigate if link available
    if (event.link) {
      router.push(event.link.href);
      setIsOpen(false);
    }
  };

  const handleTogglePanel = () => {
    setIsOpen(!isOpen);
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'price_alert':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 1.5L11.5 8H4.5M11.5 8H4.5M8 14.5V8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'transaction_update':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 1.5v13m0 0L4.5 11m3.5 3.5l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'payout_update':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1" />
            <path d="M8 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'tier_change':
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2L3 5v4c0 4 5 5 5 5s5-1 5-5V5l-5-3z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'price_alert':
        return 'text-amber-400';
      case 'transaction_update':
        return 'text-blue-400';
      case 'payout_update':
        return 'text-emerald-400';
      case 'tier_change':
        return 'text-purple-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={handleTogglePanel}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={cn(
          'relative p-2 text-[#777777] hover:text-[#c9a962] transition-colors',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
          'rounded'
        )}
        title={`Notifications (${unreadCount} unread)`}
      >
        {/* Bell Icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute top-1 right-1 min-w-[20px] h-5 px-1 rounded-full',
              'bg-[#c9a962] text-[#0a0a0a] text-[10px] font-bold',
              'flex items-center justify-center'
            )}
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadBadgeText}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className={cn(
            'absolute right-0 top-full mt-2 w-80 max-h-96',
            'bg-[#111111] border border-[#333333] rounded shadow-xl',
            'z-50 flex flex-col overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#333333]">
            <h3 className="text-sm font-semibold text-white tracking-wide">NOTIFICATIONS</h3>
            {events.length > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className={cn(
                  'text-[10px] text-[#c9a962] hover:text-[#dbb76d]',
                  'transition-colors focus:outline-none focus-visible:underline'
                )}
                title="Mark all as read"
              >
                Mark Read
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <AsyncBoundary
              isLoading={loading}
              isEmpty={events.length === 0}
              loadingContent={<ListLoadingState rows={3} />}
              emptyContent={
                <ListEmptyState
                  title="No notifications yet"
                  description="Stay tuned for updates on your transactions"
                  icon={
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  }
                />
              }
            >
              {/* Notification list */}
              <ul className="divide-y divide-[#222222]">
                {events.map(event => (
                  <li
                    key={event.id}
                    className={cn(
                      'px-4 py-3 border-l-4 transition-colors hover:bg-[#1a1a1a]',
                      event.read ? 'border-[#222222] bg-[#0a0a0a]' : 'border-[#c9a962] bg-[#1a1a1a]'
                    )}
                  >
                    <button
                      onClick={() => handleNotificationClick(event)}
                      className={cn(
                        'w-full text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962] rounded px-1',
                        'transition-all'
                      )}
                      aria-label={`${event.title}: ${event.description}`}
                    >
                      {/* Event header */}
                      <div className="flex items-start gap-2 mb-1">
                        <span className={cn('shrink-0 mt-0.5', getEventTypeColor(event.type))}>
                          {getEventIcon(event.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {event.title}
                            </h4>
                            {!event.read && (
                              <span
                                className="shrink-0 w-2 h-2 rounded-full bg-[#c9a962]"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <p className="text-[11px] text-[#777777] mt-0.5 line-clamp-2">
                            {event.description}
                          </p>
                          <p className="text-[10px] text-[#555555] mt-1">
                            {formatTime(event.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      {event.link && (
                        <div className="mt-2 text-[10px]">
                          <span className="inline-block px-2 py-1 bg-[#1a1a1a] text-[#c9a962] rounded hover:bg-[#222222]">
                            {event.link.label}
                          </span>
                        </div>
                      )}
                    </button>

                    {/* Remove button */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onRemoveEvent(event.id);
                      }}
                      className="absolute right-2 top-2 text-[#555555] hover:text-[#777777] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962] rounded"
                      aria-label="Remove notification"
                      title="Remove"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path
                          d="M12 4L4 12M4 4L12 12"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </AsyncBoundary>
          </div>

          {/* Footer */}
          {events.length > 0 && (
            <div className="px-4 py-2 border-t border-[#333333] bg-[#0a0a0a]">
              <button
                onClick={onClearAll}
                className={cn(
                  'w-full text-[10px] text-[#777777] hover:text-red-400',
                  'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a962]',
                  'py-1 rounded tracking-widest uppercase'
                )}
                title="Clear all notifications"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  // Format as date
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
