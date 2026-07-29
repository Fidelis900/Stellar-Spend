# Notification Center - Design & Implementation

## Overview

The Notification Center aggregates all application notifications into a single, accessible interface. It combines price alerts, transaction updates, payout status changes, and tier changes into a unified notification panel accessible from the header.

## Features

### 1. Aggregated Notifications

Collects notifications from multiple sources:

- **Price Alerts** - From `PriceAlertStorage` when alerts trigger
- **Transaction Updates** - From notification delivery records (pending, completed, failed)
- **Payout Status** - From transaction polling (pending, processing, settled, failed, refunded, expired)
- **Tier Changes** - Custom events when user tier changes

### 2. Unread State & Persistence

- Tracks read/unread state for each notification
- Persists to localStorage (`stellar_spend_notification_center`)
- Survives page reloads and browser sessions
- Shows unread badge with count (capped at "99+")

### 3. Deep Linking

Each notification includes a link to relevant context:

- Price alerts → `/price-alerts/{alertId}`
- Transactions → `/transaction/{transactionId}`
- Payouts → `/transaction/{transactionId}?tab=payout`
- Tier changes → `/account/tier`

### 4. Keyboard Accessible

- Escape key closes panel
- Tab navigation through items
- Focus management (focuses bell button when closing)
- Full ARIA labels and roles

### 5. Visual States

- **Empty State** - Shows when no notifications
- **Loading State** - While fetching new notifications
- **Overflow Badge** - Shows "99+" for 100+ unread
- **Unread Indicator** - Dot next to unread notifications
- **Color Coded Types** - Different colors for each notification type

## Architecture

### Core Files

**Hook:**

- `src/hooks/useNotificationCenter.ts` - Main state management and aggregation

**Component:**

- `src/components/NotificationCenter.tsx` - Bell icon + dropdown panel UI

**Tests:**

- `src/hooks/__tests__/useNotificationCenter.test.tsx` - Hook tests (40+ cases)
- `src/components/__tests__/NotificationCenter.test.tsx` - Component tests (25+ cases)

**Updated:**

- `src/components/Header.tsx` - Integrated notification center in header

### Data Flow

```
User Actions / Events
    ↓
Event Sources (Price Alerts, Transactions, Payouts, Tiers)
    ↓
useNotificationCenter Hook
    ↓
localStorage Persistence
    ↓
NotificationCenter Component
    ↓
User Interface (Bell Icon + Dropdown)
```

### Notification Event Structure

```typescript
interface NotificationCenterEvent {
  id: string; // Unique identifier
  type: 'price_alert' | 'transaction_update' | 'payout_update' | 'tier_change';
  title: string; // e.g., "Price Alert: NGN"
  description: string; // e.g., "Your alert for NGN at ₦500 has triggered"
  read: boolean; // Read/unread state
  createdAt: number; // Timestamp in milliseconds
  link?: {
    // Deep link to relevant page
    href: string;
    label: string;
  };
  metadata?: Record<string, unknown>; // Additional context
}
```

## Usage

### Basic Integration

```typescript
import { useNotificationCenter } from '@/hooks/useNotificationCenter';
import { NotificationCenter } from '@/components/NotificationCenter';

export function App() {
  const notifications = useNotificationCenter(userAddress);

  return (
    <NotificationCenter
      events={notifications.events}
      unreadCount={notifications.unreadCount}
      unreadBadgeText={notifications.unreadBadgeText}
      loading={notifications.loading}
      onMarkAsRead={notifications.markAsRead}
      onMarkAllAsRead={notifications.markAllAsRead}
      onRemoveEvent={notifications.removeEvent}
      onClearAll={notifications.clearAll}
    />
  );
}
```

### Adding Notifications Programmatically

```typescript
const notifications = useNotificationCenter(userAddress);

// Add price alert notification
notifications.addEvent({
  id: 'price-alert-1',
  type: 'price_alert',
  title: 'Price Alert: NGN',
  description: 'Alert triggered at ₦500',
  read: false,
  createdAt: Date.now(),
  link: { href: '/price-alerts/1', label: 'View Alert' },
});

// Add tier change notification
notifications.addTierChangeEvent('gold', 'silver');

// Aggregate transaction updates
notifications.aggregateTransactionUpdates(deliveryRecords);

// Aggregate payout updates
notifications.aggregatePayoutUpdates(transactions);
```

### Managing Notifications

```typescript
const notifications = useNotificationCenter(userAddress);

// Mark single as read
notifications.markAsRead('event-id');

// Mark all as read
notifications.markAllAsRead();

// Remove event
notifications.removeEvent('event-id');

// Clear all
notifications.clearAll();

// Refresh from sources
notifications.refresh();
```

## Design Details

### Bell Icon

- Located in header after theme toggle
- Shows unread count badge when > 0
- Gold/accent color
- Changes on hover

### Dropdown Panel

- Positioned right-aligned below bell
- Fixed width (320px), scrollable
- Max height 384px
- Dark theme matching app
- Z-index 50 for layering

### Header Section

- Shows "NOTIFICATIONS" title
- "Mark Read" button to mark all as read
- Sticky positioning in dropdown

### Event List

- Sorted newest first
- Left border accent (gold for unread, dark for read)
- Hover effect (slightly lighter background)
- Color-coded by type (icons and borders)

### Actions

- Click event to mark as read + navigate
- Click "X" to remove individual event
- "Clear All" button in footer
- "Mark Read" in header

### Empty State

- Bell icon
- "No notifications yet"
- Subtext about staying tuned

### Footer

- "Clear All" button
- Only shows when events exist

## Event Type Styling

| Type                 | Color   | Icon     | Example                 |
| -------------------- | ------- | -------- | ----------------------- |
| `price_alert`        | Amber   | Trending | "Price Alert: NGN"      |
| `transaction_update` | Blue    | Download | "Transaction Completed" |
| `payout_update`      | Emerald | Clock    | "Payout Settled"        |
| `tier_change`        | Purple  | Shield   | "Tier Changed to Gold"  |

## Accessibility Features

1. **ARIA Labels**

   - `aria-label` on bell button
   - `aria-expanded` for panel state
   - `aria-haspopup="dialog"`
   - `role="dialog"` on panel

2. **Keyboard Navigation**

   - Tab to bell button
   - Escape to close
   - Tab through notification items
   - Focus management (returns to bell on close)

3. **Screen Reader Support**

   - Unread count in button label
   - Event title and description read as one unit
   - "Unread" indicator narrated
   - All buttons labeled

4. **Visual Indicators**
   - Unread dot indicator
   - Border color difference (read vs unread)
   - Status badges

## Testing

### Test Coverage: 65+ Cases

**Hook Tests (40+ cases)**

- Initialization & state management
- Adding/updating events
- Mark as read (single & all)
- Remove & clear operations
- Unread count tracking
- Badge text formatting ("99+" overflow)
- localStorage persistence
- Event aggregation (price, transaction, payout, tier)
- Event sorting (newest first)
- Edge cases & error handling

**Component Tests (25+ cases)**

- Bell button rendering & toggle
- Unread badge display
- Empty state
- Loading state
- Notification list display
- Event interactions (click, remove)
- Mark all as read
- Clear all
- Keyboard accessibility (Escape, Tab, Focus)
- Event type styling
- Panel closing (outside click)
- Focus management

### Run Tests

```bash
npm run test -- useNotificationCenter --run
npm run test -- NotificationCenter --run
```

## Performance Considerations

1. **Lazy Loading**

   - Events loaded on demand
   - Polling interval: 30 seconds (configurable)
   - Persisted to localStorage for instant load

2. **Memory Management**

   - Max 100 events retained (oldest discarded)
   - Event listeners cleaned up on unmount
   - Polling interval cleared on unmount

3. **Storage Efficiency**
   - localStorage key: `stellar_spend_notification_center`
   - Typical size: <100KB for 100 events
   - JSON serialization for persistence

## Browser Compatibility

- Modern browsers with localStorage support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- IE not supported

## Future Enhancements

1. **Notification Categories**

   - Filter by type (Alerts, Transactions, etc.)
   - Favorite/star important notifications

2. **Notification Actions**

   - Snooze notifications
   - Archive old notifications
   - Custom sorting (date, type, importance)

3. **Backend Sync**

   - Server-side notification history
   - Cross-device sync
   - Notification preferences API

4. **Rich Notifications**

   - Action buttons (Retry, Acknowledge)
   - Multi-step notification workflows
   - Notification groups (batch related events)

5. **Analytics**
   - Track notification engagement
   - Most common notification types
   - User interaction patterns

## Edge Cases Handled

1. ✓ Duplicate events (updated instead of duplicated)
2. ✓ Very large unread counts (shows "99+")
3. ✓ Corrupted localStorage (graceful recovery)
4. ✓ No user address (shows error state)
5. ✓ Rapid event additions (maintains order)
6. ✓ Event removal during iteration
7. ✓ Browser storage quota exceeded (silently fails to persist)
8. ✓ Multiple browser tabs (separate instances)

## Security Considerations

- Events not containing sensitive data
- localStorage only on client-side
- No authentication required for local persistence
- Event links validated before navigation
- XSS protection via React's built-in escaping

## Troubleshooting

### No notifications appearing

- Check `useNotificationCenter` is initialized with valid user address
- Verify event sources are calling `addEvent()`
- Check localStorage is enabled in browser

### Unread badge not showing

- Verify unread events exist (check localStorage)
- Confirm `unreadCount > 0`

### Panel not closing

- Check if outside click listener is attached
- Verify Escape key handler is registered

### Events not persisting

- Check browser allows localStorage
- Verify storage quota not exceeded
- Check console for errors

## Contributing

When adding new event types:

1. Add type to `NotificationCenterEventType`
2. Add aggregation method to hook
3. Update `getEventIcon()` in component
4. Update `getEventTypeColor()` in component
5. Add tests for aggregation
6. Update documentation

## References

- localStorage API: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- ARIA: https://www.w3.org/WAI/standards-guidelines/aria/
- Keyboard navigation: https://www.w3.org/WAI/ARIA/apg/
