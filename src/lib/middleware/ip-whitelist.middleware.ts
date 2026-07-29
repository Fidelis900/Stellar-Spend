import { NextRequest, NextResponse } from 'next/server';
import { ipWhitelistService } from '@/lib/ip-whitelist';
import { logger } from '@/lib/logger';

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function ipWhitelistMiddleware(request: NextRequest) {
  const userAddress = request.headers.get('x-user-address');
  if (!userAddress) {
    return NextResponse.next();
  }

  const clientIP = getClientIP(request);

  try {
    const isWhitelisted = await ipWhitelistService.isIPWhitelisted(userAddress, clientIP);

    if (!isWhitelisted) {
      await ipWhitelistService.logViolation(
        userAddress,
        clientIP,
        'unauthorized_access',
        'high',
        `Unauthorized IP access attempt on ${request.nextUrl.pathname}`,
      );

      logger.warn(`Unauthorized IP access attempt`, {
        userId: userAddress,
        ip: clientIP,
        path: request.nextUrl.pathname,
      });

      return NextResponse.json({ error: 'IP address not whitelisted' }, { status: 403 });
    }
  } catch (error) {
    logger.error('IP whitelist check failed', { error, userAddress, clientIP });
    // Allow request to proceed on error to avoid blocking legitimate users
    return NextResponse.next();
  }

  return NextResponse.next();
}
