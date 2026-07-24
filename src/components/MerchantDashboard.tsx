'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardContent, Badge, Button } from '@/components/design-system';
import type { MerchantStats, MerchantPayout } from '@/lib/services/merchant.service';

interface MerchantDashboardProps {
  merchantId: string;
  businessName: string;
  stats: MerchantStats;
  recentPayouts: MerchantPayout[];
  onCreatePayout?: () => void;
}

function statusVariant(status: MerchantPayout['status']): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'completed': return 'success';
    case 'processing': return 'warning';
    case 'failed': return 'error';
    default: return 'default';
  }
}

export function MerchantDashboard({
  businessName,
  stats,
  recentPayouts,
  onCreatePayout,
}: MerchantDashboardProps) {
  const [showNewPayout, setShowNewPayout] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{businessName}</h1>
        <Button onClick={() => { setShowNewPayout(true); onCreatePayout?.(); }}>
          New Bulk Payout
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Total Payouts</p>
            <p className="text-2xl font-bold">{stats.totalPayouts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Success Rate</p>
            <p className="text-2xl font-bold">{stats.successRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Total Volume</p>
            <p className="text-2xl font-bold">{stats.totalVolume.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Failed</p>
            <p className="text-2xl font-bold">{stats.failedPayouts}</p>
          </CardContent>
        </Card>
      </div>

      {/* New Payout placeholder */}
      {showNewPayout && (
        <Card variant="outlined">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">New Bulk Payout</h2>
              <button
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setShowNewPayout(false)}
              >
                ✕
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Submit payouts via <code>POST /api/merchant/payouts</code> with your{' '}
              <code>merchantId</code>, <code>idempotencyKey</code>, and <code>items</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent Payouts */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Recent Payouts</h2>
        </CardHeader>
        <CardContent>
          {recentPayouts.length === 0 ? (
            <p className="text-sm text-gray-500">No payouts yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">ID</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Currency</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentPayouts.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{p.id.slice(0, 8)}…</td>
                    <td className="py-2">{p.totalAmount.toLocaleString()}</td>
                    <td className="py-2">{p.currency}</td>
                    <td className="py-2">
                      <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                    </td>
                    <td className="py-2">{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
