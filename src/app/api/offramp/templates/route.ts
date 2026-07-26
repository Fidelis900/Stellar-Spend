import { NextRequest, NextResponse } from 'next/server';
import { TransactionTemplate, TemplateStorage } from '@/lib/transaction-templates';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';

export async function GET(req: NextRequest) {
  try {
    const ownerAddress = req.nextUrl.searchParams.get('ownerAddress');
    const userAddress = req.nextUrl.searchParams.get('userAddress');

    if (!ownerAddress && !userAddress) {
      return ErrorHandler.validation('Missing ownerAddress or userAddress');
    }

    const address = (userAddress || ownerAddress) as string;
    const templates = userAddress
      ? TemplateStorage.getAccessibleTemplates(address)
      : TemplateStorage.getTemplatesByOwner(address);

    return NextResponse.json({ templates });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to fetch templates'));
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, amount, currency, feeMethod, category, ownerAddress, beneficiaryId, note } = body;

    if (!name || !amount || !currency || !feeMethod || !ownerAddress) {
      return ErrorHandler.validation('Missing required fields');
    }

    if (!['XLM', 'USDC'].includes(feeMethod)) {
      return ErrorHandler.validation('Invalid feeMethod');
    }

    const template: Omit<TransactionTemplate, 'id' | 'createdAt' | 'sharedWith'> = {
      name,
      amount: String(amount),
      currency,
      feeMethod,
      category: category ?? 'General',
      ownerAddress,
      usageCount: 0,
      beneficiaryId,
      note,
    };

    const created = TemplateStorage.createTemplate(template);
    return NextResponse.json({ template: created }, { status: 201 });
  } catch {
    return ErrorHandler.handle(new ApiError(ErrorType.SERVER_ERROR, 'Failed to create template'));
  }
}
