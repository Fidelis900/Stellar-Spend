import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { dal } from '@/lib/db/dal';
import type { Transaction } from '@/lib/transaction-storage';
import { calculateAllFees } from '@/lib/fee-calculation';
import { withIdempotency } from '@/lib/idempotency';
import { KYCLimitService } from '@/lib/kyc-limits';
import { isSupportedCurrency } from '@/lib/currencies';
import { screenAddress, isHighValue } from '@/lib/compliance-screening';

type FeeMethodInput = 'USDC' | 'XLM' | 'stablecoin' | 'native';

function normalizeFeeMethod(feeMethod?: FeeMethodInput): Transaction['feeMethod'] | undefined {
  if (!feeMethod) return undefined;
  if (feeMethod === 'USDC' || feeMethod === 'stablecoin') return 'stablecoin';
  if (feeMethod === 'XLM' || feeMethod === 'native') return 'native';
  return undefined;
}

export async function POST(request: NextRequest) {
  return withIdempotency(request, async () => {
    let body: Partial<Transaction> & {
      userAddress?: string;
      feeMethod?: FeeMethodInput;
      receiveAmount?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
    }

    const {
      userAddress,
      amount,
      currency,
      beneficiary,
      receiveAmount,
    } = body as {
      userAddress?: string;
      amount?: string;
      currency?: string;
      beneficiary?: Transaction['beneficiary'];
      receiveAmount?: string;
    };

    if (!userAddress || !amount || !currency || !beneficiary) {
      return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
    }

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: `Unsupported currency: ${currency}` }, { status: 400 });
    }

    // Server-side KYC limit enforcement
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Compliance screening on source address and beneficiary account
    const sourceScreen = await screenAddress(
      { address: userAddress, addressType: 'stellar', amount: numericAmount, currency },
      { failClosed: isHighValue(numericAmount) },
    );
    if (sourceScreen.verdict === 'deny') {
      return NextResponse.json(
        { error: 'Source address blocked by compliance', screening: sourceScreen },
        { status: 403 },
      );
    }

    if (beneficiary?.accountIdentifier) {
      const beneficiaryScreen = await screenAddress({
        address: beneficiary.accountIdentifier,
        addressType: 'bank',
        amount: numericAmount,
        currency,
      });
      if (beneficiaryScreen.verdict === 'deny') {
        return NextResponse.json(
          { error: 'Beneficiary account blocked by compliance', screening: beneficiaryScreen },
          { status: 403 },
        );
      }
    }

    const canTransact = KYCLimitService.canTransact(userAddress, numericAmount, currency);
    if (!canTransact.allowed) {
      return NextResponse.json({ error: `Transaction blocked: ${canTransact.reason}` }, { status: 403 });
    }

    const feeMethod = normalizeFeeMethod(body.feeMethod);
    const feeBreakdown = feeMethod
      ? await calculateAllFees({ amount, currency, feeMethod, receiveAmount })
      : null;

    const id = uuidv4();
    const transaction: Transaction = {
      id,
      timestamp: Date.now(),
      userAddress,
      amount,
      currency,
      feeMethod,
      bridgeFee: feeBreakdown?.bridgeFee,
      networkFee: feeBreakdown?.networkFee,
      paycrestFee: feeBreakdown?.paycrestFee,
      totalFee: feeBreakdown?.totalFee,
      beneficiary,
      status: 'pending',
    };

    try {
      await dal.save(transaction);
    } catch {
      return NextResponse.json({ error: 'internal server error' }, { status: 500 });
    }

    // Record the transaction for KYC limit tracking
    KYCLimitService.recordTransaction(userAddress, numericAmount);

    return NextResponse.json({ id, status: 'pending' }, { status: 200 });
  }, { required: true });
}
