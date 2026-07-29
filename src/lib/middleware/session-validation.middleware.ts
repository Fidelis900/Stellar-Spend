import { NextRequest, NextResponse } from 'next/server';
import { sessionManagementService } from '@/lib/session-management';
import { logger } from '@/lib/logger';

export async function sessionValidationMiddleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.next();
  }

  const token = authHeader.substring(7);

  try {
    const session = await sessionManagementService.validateSession(token);

    if (!session) {
      logger.warn(`Invalid or expired session token attempted`);
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    // Add session info to request headers for downstream handlers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-session-id', session.id);
    requestHeaders.set('x-user-address', session.userAddress);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    logger.error('Session validation failed', { error });
    return NextResponse.next();
  }
}
