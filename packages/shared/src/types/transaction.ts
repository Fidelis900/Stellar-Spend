export type TransactionStatus =
    | "pending"
    | "signing"
    | "submitted"
    | "bridging"
    | "paying_out"
    | "complete"
    | "failed";

export interface Transaction {
    id: string;
    amount: string;
    currency: string;
    status: TransactionStatus;
    timestamp: string; // ISO 8601
    sourcePublicKey: string;
    destinationAccount: string;
    bridgeTxHash?: string;
    payoutId?: string;
}

export interface Quote {
    exchangeRate: number;
    sourceAmount: string;
    destinationAmount: string;
    fees: QuoteFees;
    expiresAt: string; // ISO 8601
}

export interface QuoteFees {
    bridgeFee: string;
    networkFee: string;
    payoutFee: string;
    total: string;
}
