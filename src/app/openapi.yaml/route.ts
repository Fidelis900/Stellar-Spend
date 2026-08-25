import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /openapi.yaml
 *
 * Serves the OpenAPI 3.0 YAML specification for external consumers,
 * API gateways, client SDK generators, and Swagger UI.
 */
export async function GET() {
  try {
    const filePath = path.resolve(process.cwd(), 'openapi.yaml');
    const content = fs.readFileSync(filePath, 'utf8');

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/yaml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (_error) {
    return NextResponse.json(
      { error: 'server_error', message: 'OpenAPI specification file not found' },
      { status: 500 },
    );
  }
}
