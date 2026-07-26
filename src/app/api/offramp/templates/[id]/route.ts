import { NextRequest, NextResponse } from 'next/server';
import { TemplateStorage } from '@/lib/transaction-templates';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const template = TemplateStorage.getTemplate(params.id);
    if (!template) {
      return ErrorHandler.notFound("Template");
    }
    return NextResponse.json({ template });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch template'));
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const { action, targetAddress, ...updates } = body;

    if (action === 'share') {
      if (!targetAddress) {
        return ErrorHandler.validation('Missing targetAddress');
      }
      const template = TemplateStorage.shareTemplate(params.id, targetAddress);
      if (!template) return ErrorHandler.notFound("Template");
      return NextResponse.json({ template });
    }

    if (action === 'unshare') {
      if (!targetAddress) {
        return ErrorHandler.validation('Missing targetAddress');
      }
      const template = TemplateStorage.unshareTemplate(params.id, targetAddress);
      if (!template) return ErrorHandler.notFound("Template");
      return NextResponse.json({ template });
    }

    if (action === 'use') {
      TemplateStorage.recordUsage(params.id);
      return NextResponse.json({ recorded: true });
    }

    const updated = TemplateStorage.updateTemplate(params.id, updates);
    if (!updated) return ErrorHandler.notFound("Template");
    return NextResponse.json({ template: updated });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to update template'));
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const deleted = TemplateStorage.deleteTemplate(params.id);
    if (!deleted) return ErrorHandler.notFound("Template");
    return NextResponse.json({ deleted: params.id });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to delete template'));
  }
}
