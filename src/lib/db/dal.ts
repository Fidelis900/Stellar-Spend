import { pool } from "./client";
import type { Transaction } from "../transaction-storage";
import { queryOptimizer } from "./query-optimizer";

async function timedQuery(sql: string, values: unknown[]) {
    const start = Date.now();
    const result = await pool.query(sql, values);
    queryOptimizer.recordQuery(sql, Date.now() - start, result.rowCount ?? 0);
    return result;
}

export class DatabaseError extends Error {
    constructor(
        message: string,
        public readonly cause: unknown,
    ) {
        super(message);
        this.name = "DatabaseError";
    }
}

export interface DAL {
    save(transaction: Transaction): Promise<void>;
    update(id: string, updates: Partial<Transaction>): Promise<void>;
    getByUser(userAddress: string): Promise<Transaction[]>;
    getById(id: string): Promise<Transaction | null>;
    getByPayoutOrderId(orderId: string): Promise<Transaction | null>;
}

// Maps a flat DB row to the nested Transaction object
function rowToTransaction(row: Record<string, unknown>): Transaction {
    return {
        id: row.id as string,
        timestamp: Number(row.timestamp),
        finalizedAt: row.finalized_at ? Number(row.finalized_at) : undefined,
        userAddress: row.user_address as string,
        amount: row.amount as string,
        currency: row.currency as string,
        feeMethod: (row.fee_method as Transaction["feeMethod"] | null) ?? undefined,
        bridgeFee: (row.bridge_fee as string | null) ?? undefined,
        networkFee: (row.network_fee as string | null) ?? undefined,
        paycrestFee: (row.paycrest_fee as string | null) ?? undefined,
        totalFee: (row.total_fee as string | null) ?? undefined,
        stellarTxHash: (row.stellar_tx_hash as string | null) ?? undefined,
        bridgeStatus: (row.bridge_status as string | null) ?? undefined,
        payoutOrderId: (row.payout_order_id as string | null) ?? undefined,
        payoutStatus: (row.payout_status as string | null) ?? undefined,
        beneficiary: {
            institution: row.beneficiary_institution as string,
            accountIdentifier: row.beneficiary_account_identifier as string,
            accountName: row.beneficiary_account_name as string,
            currency: row.beneficiary_currency as string,
        },
        status: row.status as Transaction["status"],
        error: (row.error as string | null) ?? undefined,
    };
}

export const dal: DAL = {
    async save(transaction: Transaction): Promise<void> {
        const finalizedAt =
            transaction.finalizedAt ??
            (transaction.status === "completed" || transaction.status === "failed"
                ? Date.now()
                : null);
        const sql = `
      INSERT INTO transactions (
        id, timestamp, finalized_at, user_address, amount, currency,
        fee_method, bridge_fee, network_fee, paycrest_fee, total_fee,
        stellar_tx_hash, bridge_status, payout_order_id, payout_status,
        beneficiary_institution, beneficiary_account_identifier,
        beneficiary_account_name, beneficiary_currency,
        status, error
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21
      )
    `;
        const values = [
            transaction.id,
            transaction.timestamp,
            finalizedAt,
            transaction.userAddress,
            transaction.amount,
            transaction.currency,
            transaction.feeMethod ?? null,
            transaction.bridgeFee ?? null,
            transaction.networkFee ?? null,
            transaction.paycrestFee ?? null,
            transaction.totalFee ?? null,
            transaction.stellarTxHash ?? null,
            transaction.bridgeStatus ?? null,
            transaction.payoutOrderId ?? null,
            transaction.payoutStatus ?? null,
            transaction.beneficiary.institution,
            transaction.beneficiary.accountIdentifier,
            transaction.beneficiary.accountName,
            transaction.beneficiary.currency,
            transaction.status,
            transaction.error ?? null,
        ];
        try {
            await timedQuery(sql, values);
        } catch (err) {
            throw new DatabaseError(
                `Failed to save transaction: ${(err as Error).message}`,
                err,
            );
        }
    },

    async update(id: string, updates: Partial<Transaction>): Promise<void> {
        const normalizedUpdates = { ...updates };
        const shouldAutoFinalize =
            normalizedUpdates.status !== undefined &&
            (normalizedUpdates.status === "completed" || normalizedUpdates.status === "failed") &&
            normalizedUpdates.finalizedAt === undefined;

        if (shouldAutoFinalize) {
            normalizedUpdates.finalizedAt = Date.now();
        }

        // Build a dynamic SET clause from the updates, mapping camelCase to snake_case
        const columnMap: Record<string, string> = {
            timestamp: "timestamp",
            finalizedAt: "finalized_at",
            userAddress: "user_address",
            amount: "amount",
            currency: "currency",
            feeMethod: "fee_method",
            bridgeFee: "bridge_fee",
            networkFee: "network_fee",
            paycrestFee: "paycrest_fee",
            totalFee: "total_fee",
            stellarTxHash: "stellar_tx_hash",
            bridgeStatus: "bridge_status",
            payoutOrderId: "payout_order_id",
            payoutStatus: "payout_status",
            status: "status",
            error: "error",
        };

        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(normalizedUpdates)) {
            if (key === "beneficiary" && value && typeof value === "object") {
                const b = value as Transaction["beneficiary"];
                if (b.institution !== undefined) {
                    setClauses.push(`beneficiary_institution = $${paramIndex++}`);
                    values.push(b.institution);
                }
                if (b.accountIdentifier !== undefined) {
                    setClauses.push(`beneficiary_account_identifier = $${paramIndex++}`);
                    values.push(b.accountIdentifier);
                }
                if (b.accountName !== undefined) {
                    setClauses.push(`beneficiary_account_name = $${paramIndex++}`);
                    values.push(b.accountName);
                }
                if (b.currency !== undefined) {
                    setClauses.push(`beneficiary_currency = $${paramIndex++}`);
                    values.push(b.currency);
                }
            } else if (key in columnMap) {
                if (key === "finalizedAt" && shouldAutoFinalize) {
                    setClauses.push(`finalized_at = COALESCE(finalized_at, $${paramIndex++})`);
                } else {
                    setClauses.push(`${columnMap[key]} = $${paramIndex++}`);
                }
                values.push(value ?? null);
            }
        }

        if (setClauses.length === 0) return;

        values.push(id);
        const sql = `UPDATE transactions SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`;

        try {
            await timedQuery(sql, values);
        } catch (err) {
            throw new DatabaseError(
                `Failed to update transaction ${id}: ${(err as Error).message}`,
                err,
            );
        }
    },

    async getByUser(userAddress: string): Promise<Transaction[]> {
        const sql = `
      SELECT * FROM transactions
      WHERE LOWER(user_address) = LOWER($1)
      ORDER BY timestamp DESC
    `;
        try {
            const result = await timedQuery(sql, [userAddress]);
            return result.rows.map(rowToTransaction);
        } catch (err) {
            throw new DatabaseError(
                `Failed to get transactions for user ${userAddress}: ${(err as Error).message}`,
                err,
            );
        }
    },

    async getById(id: string): Promise<Transaction | null> {
        const sql = `SELECT * FROM transactions WHERE id = $1`;
        try {
            const result = await timedQuery(sql, [id]);
            if (result.rows.length === 0) return null;
            return rowToTransaction(result.rows[0]);
        } catch (err) {
            throw new DatabaseError(
                `Failed to get transaction ${id}: ${(err as Error).message}`,
                err,
            );
        }
    },

    async getByPayoutOrderId(orderId: string): Promise<Transaction | null> {
        const sql = `SELECT * FROM transactions WHERE payout_order_id = $1`;
        try {
            const result = await timedQuery(sql, [orderId]);
            if (result.rows.length === 0) return null;
            return rowToTransaction(result.rows[0]);
        } catch (err) {
            throw new DatabaseError(
                `Failed to get transaction by payout order id ${orderId}: ${(err as Error).message}`,
                err,
            );
        }
    },
};
