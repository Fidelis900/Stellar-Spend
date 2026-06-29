import { pool as db } from '@/lib/db/client';

export interface MerchantAccount {
  id: string;
  userId: string;
  businessName: string;
  businessEmail: string;
  role: 'owner' | 'admin' | 'viewer';
  webhookUrl?: string;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface BulkPayoutItem {
  beneficiaryInstitution: string;
  beneficiaryAccount: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
}

export interface MerchantPayout {
  id: string;
  merchantId: string;
  idempotencyKey: string;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  items?: MerchantPayoutItem[];
}

export interface MerchantPayoutItem {
  id: string;
  payoutId: string;
  beneficiaryInstitution: string;
  beneficiaryAccount: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface MerchantStats {
  totalPayouts: number;
  completedPayouts: number;
  failedPayouts: number;
  successRate: number;
  totalVolume: number;
}

function rowToMerchant(row: Record<string, unknown>): MerchantAccount {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    businessName: row.business_name as string,
    businessEmail: row.business_email as string,
    role: row.role as 'owner' | 'admin' | 'viewer',
    webhookUrl: row.webhook_url as string | undefined,
    status: row.status as 'active' | 'suspended',
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

function rowToPayout(row: Record<string, unknown>): MerchantPayout {
  return {
    id: row.id as string,
    merchantId: row.merchant_id as string,
    idempotencyKey: row.idempotency_key as string,
    totalAmount: parseFloat(row.total_amount as string),
    currency: row.currency as string,
    status: row.status as MerchantPayout['status'],
    createdAt: (row.created_at as Date).toISOString(),
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : undefined,
  };
}

function rowToItem(row: Record<string, unknown>): MerchantPayoutItem {
  return {
    id: row.id as string,
    payoutId: row.payout_id as string,
    beneficiaryInstitution: row.beneficiary_institution as string,
    beneficiaryAccount: row.beneficiary_account as string,
    beneficiaryName: row.beneficiary_name as string,
    amount: parseFloat(row.amount as string),
    currency: row.currency as string,
    status: row.status as MerchantPayoutItem['status'],
    errorMessage: row.error_message as string | undefined,
  };
}

export class MerchantService {
  async createMerchant(userId: string, businessName: string, businessEmail: string): Promise<MerchantAccount> {
    if (!userId || !businessName || !businessEmail) {
      throw new Error('userId, businessName, and businessEmail are required');
    }
    const result = await db.query(
      `INSERT INTO merchant_accounts (user_id, business_name, business_email)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, businessName, businessEmail]
    );
    return rowToMerchant(result.rows[0]);
  }

  async getMerchant(merchantId: string): Promise<MerchantAccount | null> {
    const result = await db.query(
      `SELECT * FROM merchant_accounts WHERE id = $1`,
      [merchantId]
    );
    return result.rows[0] ? rowToMerchant(result.rows[0]) : null;
  }

  async getMerchantByUserId(userId: string): Promise<MerchantAccount | null> {
    const result = await db.query(
      `SELECT * FROM merchant_accounts WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] ? rowToMerchant(result.rows[0]) : null;
  }

  async createBulkPayout(
    merchantId: string,
    idempotencyKey: string,
    items: BulkPayoutItem[]
  ): Promise<MerchantPayout> {
    if (!merchantId || !idempotencyKey || !items?.length) {
      throw new Error('merchantId, idempotencyKey, and items are required');
    }

    const currency = items[0].currency;
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    // Check idempotency — return existing if key already used
    const existing = await db.query(
      `SELECT * FROM merchant_payouts WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (existing.rows[0]) return rowToPayout(existing.rows[0]);

    const payoutResult = await db.query(
      `INSERT INTO merchant_payouts (merchant_id, idempotency_key, total_amount, currency)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [merchantId, idempotencyKey, totalAmount, currency]
    );
    const payout = rowToPayout(payoutResult.rows[0]);

    for (const item of items) {
      await db.query(
        `INSERT INTO merchant_payout_items
           (payout_id, beneficiary_institution, beneficiary_account, beneficiary_name, amount, currency)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [payout.id, item.beneficiaryInstitution, item.beneficiaryAccount, item.beneficiaryName, item.amount, item.currency]
      );
    }

    return payout;
  }

  async getBulkPayoutStatus(payoutId: string): Promise<MerchantPayout | null> {
    const payoutResult = await db.query(
      `SELECT * FROM merchant_payouts WHERE id = $1`,
      [payoutId]
    );
    if (!payoutResult.rows[0]) return null;

    const payout = rowToPayout(payoutResult.rows[0]);
    const itemsResult = await db.query(
      `SELECT * FROM merchant_payout_items WHERE payout_id = $1`,
      [payoutId]
    );
    payout.items = itemsResult.rows.map(rowToItem);
    return payout;
  }

  async getMerchantPayouts(merchantId: string, page: number, limit: number): Promise<{ payouts: MerchantPayout[]; total: number }> {
    const offset = (page - 1) * limit;
    const [payoutsResult, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM merchant_payouts WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [merchantId, limit, offset]
      ),
      db.query(`SELECT COUNT(*) FROM merchant_payouts WHERE merchant_id = $1`, [merchantId]),
    ]);
    return {
      payouts: payoutsResult.rows.map(rowToPayout),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async getMerchantStats(merchantId: string): Promise<MerchantStats> {
    const result = await db.query(
      `SELECT
         COUNT(*) AS total_payouts,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_payouts,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_payouts,
         COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) AS total_volume
       FROM merchant_payouts WHERE merchant_id = $1`,
      [merchantId]
    );
    const row = result.rows[0];
    const total = parseInt(row.total_payouts, 10);
    const completed = parseInt(row.completed_payouts, 10);
    const failed = parseInt(row.failed_payouts, 10);
    return {
      totalPayouts: total,
      completedPayouts: completed,
      failedPayouts: failed,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalVolume: parseFloat(row.total_volume),
    };
  }

  async updateWebhook(merchantId: string, webhookUrl: string): Promise<MerchantAccount | null> {
    const result = await db.query(
      `UPDATE merchant_accounts SET webhook_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [webhookUrl, merchantId]
    );
    return result.rows[0] ? rowToMerchant(result.rows[0]) : null;
  }
}

export const merchantService = new MerchantService();
