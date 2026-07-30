import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { getApiKeyById } from '@/lib/api-keys';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';
import { pool } from '@/lib/db';
import { SCOPE_CATALOG } from '@/lib/api-keys';
import { auditLoggingService } from '@/lib/audit-logging';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    const apiKey = await getApiKeyById(id);
    if (!apiKey) {
      return ErrorHandler.notFound('API key');
    }

    return NextResponse.json({
      data: {
        scopes: apiKey.scopes,
        availableScopes: SCOPE_CATALOG,
      },
    });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  let body: { scopes?: string[] };
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  if (!body.scopes || !Array.isArray(body.scopes)) {
    return ErrorHandler.validation('scopes array is required');
  }

  const validScopeKeys = Object.keys(SCOPE_CATALOG);
  for (const s of body.scopes) {
    if (!validScopeKeys.includes(s)) {
      return ErrorHandler.validation(
        `Invalid scope: "${s}". Valid scopes: ${validScopeKeys.join(', ')}`,
      );
    }
  }

  try {
    const existing = await getApiKeyById(id);
    if (!existing) {
      return ErrorHandler.notFound('API key');
    }

    const result = await pool.query(
      `UPDATE api_keys SET scopes = $1::jsonb, updated_at = $2 WHERE id = $3 RETURNING *`,
      [JSON.stringify(body.scopes), Date.now(), id],
    );

    if (result.rows.length === 0) {
      return ErrorHandler.notFound('API key');
    }

    await auditLoggingService.logAction('api_key.scopes_updated', 'api_key', 'success', {
      resourceId: id,
      actionDetails: `Scopes updated from [${existing.scopes.join(', ')}] to [${body.scopes.join(', ')}]`,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    });

    return NextResponse.json({
      data: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        scopes: result.rows[0].scopes,
        updatedAt: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
