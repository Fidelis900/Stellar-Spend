import { NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import {
  getSubscription,
  updateSubscription,
  deleteSubscription,
} from '@/lib/webhook/subscription-store';
import { requireApiKeyAdmin } from '@/app/api/api-keys/_utils';
import { isSupportedSchemaVersion, SUPPORTED_SCHEMA_VERSIONS } from '@/lib/webhook/schema-versions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    const subscription = await getSubscription(id);
    if (!subscription) return ErrorHandler.notFound('Subscription');

    const { signingSecret, ...safe } = subscription;
    return NextResponse.json({
      data: { ...safe, signingSecret: signingSecret ? signingSecret.slice(0, 8) + '...' : null },
    });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  try {
    const existing = await getSubscription(id);
    if (!existing) return ErrorHandler.notFound('Subscription');

    const updates: Record<string, unknown> = {};
    if (body.endpointUrl !== undefined) updates.endpointUrl = body.endpointUrl;
    if (body.events !== undefined) updates.events = body.events;
    if (body.status !== undefined) updates.status = body.status;
    if (body.rateLimitMaxPerMinute !== undefined) updates.rateLimitMaxPerMinute = body.rateLimitMaxPerMinute;
    if (body.description !== undefined) updates.description = body.description;
    if (body.schemaVersion !== undefined) {
      const requested = String(body.schemaVersion);
      if (!isSupportedSchemaVersion(requested)) {
        return ErrorHandler.validation(
          `Invalid schemaVersion: "${requested}". Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`
        );
      }
      updates.schemaVersion = requested;
    }

    const updated = await updateSubscription(id, updates as any);
    if (!updated) return ErrorHandler.notFound('Subscription');

    const { signingSecret, ...safe } = updated;
    return NextResponse.json({ data: safe });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKeyAdmin(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    const deleted = await deleteSubscription(id);
    if (!deleted) return ErrorHandler.notFound('Subscription');
    return NextResponse.json({ data: { id, deleted: true } });
  } catch (error) {
    return ErrorHandler.serverError(error);
  }
}
