# Public Status Page

## Overview

The public status page provides real-time visibility into system health, component status, payment corridor availability, and incident history.

## Features

### Real-Time Status

- Overall system status indicator
- Component-level health monitoring
- Payment corridor status by provider
- Auto-refresh every 30 seconds

### Uptime Metrics

- 24-hour uptime percentage
- 7-day uptime percentage
- 30-day uptime percentage

### Component Monitoring

- API response time
- Database performance
- Stellar network connectivity
- Payment provider availability

### Corridor Health

- Per-corridor status (USDC → NGN, KES, GHS, ZAR)
- Last successful transaction timestamp
- Provider-specific status

### Incident Management (Future)

- Active incident display
- Incident status tracking
- Update timeline
- Resolution history

### Notifications

- Email subscription for status updates
- RSS feed for programmatic access
- Webhook support for external systems

## Implementation

### Status Page Component

**File**: `src/components/StatusPage.tsx`

Client-side React component that displays status information with auto-refresh.

### Health API Endpoint

**File**: `src/app/api/health/route.ts`

REST endpoint that aggregates component health status.

**Response format**:

```json
{
  "status": "operational",
  "components": [...],
  "corridors": [...],
  "uptime": { "day": 99.98, "week": 99.95, "month": 99.87 },
  "timestamp": 1234567890
}
```

### Status Values

- **operational**: All systems functioning normally
- **degraded**: Some performance issues detected
- **down**: Service unavailable

## Access

Public URL: `/status`

No authentication required - accessible to all users.

## Integration

### Synthetic Monitoring

Status page can be integrated with external monitoring:

- Pingdom
- UptimeRobot
- Datadog Synthetics

### Incident Communication

Link status page from:

- Error pages
- Maintenance banners
- Email notifications
- Social media

## Future Enhancements

1. Historical uptime charts
2. Incident post-mortems
3. Scheduled maintenance announcements
4. Component dependency visualization
5. Performance metrics graphs
6. SLA tracking
