import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * GET /openapi.json
 *
 * Serves the OpenAPI 3.0 JSON specification for external consumers,
 * Postman import, and tooling integrations.
 */
export async function GET() {
  try {
    const filePath = path.resolve(process.cwd(), 'openapi.yaml');
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = yaml.load(content);

    return NextResponse.json(doc, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (_error) {
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to generate OpenAPI JSON specification' },
      { status: 500 },
    );
  }
}
