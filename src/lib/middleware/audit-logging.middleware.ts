import { NextRequest, NextResponse } from 'next/server';
import { auditLoggingService } from '@/lib/audit-logging';
import { logger } from '@/lib/logger';

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function auditLoggingMiddleware(request: NextRequest) {
  const userAddress = request.headers.get('x-user-address');
  const sessionId = request.headers.get('x-session-id');
  const clientIP = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || undefined;
  const method = request.method;
  const pathname = request.nextUrl.pathname;

  // Determine action type and resource type from the request
  let actionType = method;
  let resourceType = 'unknown';

  if (pathname.includes('/offramp/')) {
    resourceType = 'offramp';
  } else if (pathname.includes('/api-keys/')) {
    resourceType = 'api_key';
  } else if (pathname.includes('/sessions/')) {
    resourceType = 'session';
  } else if (pathname.includes('/signatures/')) {
    resourceType = 'signature';
  }

  try {
    // Log the action
    await auditLoggingService.logAction(actionType, resourceType, 'success', {
      userAddress: userAddress || undefined,
      actionDetails: `${method} ${pathname}`,
      ipAddress: clientIP,
      userAgent,
      sessionId: sessionId || undefined,
    });
  } catch (error) {
    logger.error('Failed to log audit action', { error });
    // Don't block the request if logging fails
  }

  return NextResponse.next();
}
