import { NextResponse } from 'next/server';
import { registry } from '@/lib/api-versioning';

export async function GET() {
  const versions = registry.getAll().map((entry) => {
    const v: Record<string, unknown> = {
      version: entry.version,
      status: entry.status,
      prefix: entry.prefix,
    };
    if (entry.deprecatedAt) v.deprecatedAt = entry.deprecatedAt;
    if (entry.sunsetAt) v.sunsetAt = entry.sunsetAt;
    return v;
  });

  const response = NextResponse.json({ versions }, { status: 200 });
  // Strip leading 'v' for the numeric header value (e.g. 'v1' → '1')
  response.headers.set('X-API-Version', '1');
  return response;
}
