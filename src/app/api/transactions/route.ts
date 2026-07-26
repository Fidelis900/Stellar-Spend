import { NextResponse, type NextRequest } from 'next/server';
import { dal, DatabaseError } from '@/lib/db/dal';
import { ErrorHandler } from '@/lib/error-handler';
import type { Transaction } from '@/lib/transaction-storage';
import { withIdempotency } from '@/lib/idempotency';

const REQUIRED_FIELDS: (keyof Transaction)[] = [
    'id',
    'timestamp',
    'userAddress',
    'amount',
    'currency',
    'beneficiary',
    'status',
];

const REQUIRED_BENEFICIARY_FIELDS = [
    'institution',
    'accountIdentifier',
    'accountName',
    'currency',
] as const;

export async function GET(request: NextRequest) {
    const wallet = request.nextUrl.searchParams.get('wallet');

    if (!wallet) {
        return ErrorHandler.validation('wallet address is required');
    }

    try {
        const transactions = await dal.getByUser(wallet);
        return NextResponse.json(transactions, { status: 200 });
    } catch (err) {
        if (err instanceof DatabaseError) {
            return ErrorHandler.serverError(err);
        }
        return ErrorHandler.serverError(err);
    }
}

export async function POST(request: NextRequest) {
    return withIdempotency(request, async () => {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return ErrorHandler.validation('Invalid JSON body');
        }

        for (const field of REQUIRED_FIELDS) {
            if (body[field] === undefined || body[field] === null) {
                return ErrorHandler.validation(`Missing required field: ${field}`);
            }
        }

        const beneficiary = body.beneficiary as Record<string, unknown> | undefined;
        if (!beneficiary || typeof beneficiary !== 'object') {
            return ErrorHandler.validation('Missing required field: beneficiary');
        }

        for (const field of REQUIRED_BENEFICIARY_FIELDS) {
            if (!beneficiary[field]) {
                return ErrorHandler.validation(`Missing required beneficiary field: ${field}`);
            }
        }

        const transaction = body as unknown as Transaction;

        try {
            await dal.save(transaction);
            return NextResponse.json(transaction, { status: 201 });
        } catch (err) {
            if (err instanceof DatabaseError) {
                return ErrorHandler.serverError(err);
            }
            return ErrorHandler.serverError(err);
        }
    }, { required: true });
}
