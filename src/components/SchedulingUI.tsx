import { logger } from '@/lib/logger';
('use client');

import { useState, useEffect } from 'react';

interface ScheduledTransaction {
  id: string;
  amount: number;
  currency: string;
  scheduledFor: string;
  status: string;
}

interface SchedulingUIProps {
  userId: string;
}

export function SchedulingUI({ userId }: SchedulingUIProps) {
  const [scheduled, setScheduled] = useState<ScheduledTransaction[]>([]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [scheduledFor, setScheduledFor] = useState('');

  useEffect(() => {
    fetchScheduled();
  }, [userId]);

  const fetchScheduled = async () => {
    try {
      const res = await fetch(`/api/offramp/schedule?userId=${userId}`);
      const data = await res.json();
      setScheduled(data.scheduled || []);
    } catch (error) {
      logger.error('Failed to fetch scheduled transactions', {}, error);
    }
  };

  const handleSchedule = async () => {
    if (!amount || !scheduledFor) return;

    try {
      const res = await fetch('/api/offramp/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: parseFloat(amount),
          currency,
          scheduledFor,
          action: 'schedule',
        }),
      });
      const data = await res.json();
      setScheduled([...scheduled, data.scheduled]);
      setAmount('');
      setScheduledFor('');
    } catch (error) {
      logger.error('Failed to schedule transaction', {}, error);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await fetch('/api/offramp/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledId: id, action: 'cancel' }),
      });
      setScheduled(scheduled.filter((s) => s.id !== id));
    } catch (error) {
      logger.error('Failed to cancel scheduled transaction', {}, error);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-green-50">
      <h3 className="font-semibold mb-4">Schedule Transaction</h3>

      <div className="space-y-3 mb-4">
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        >
          <option>NGN</option>
          <option>KES</option>
          <option>GHS</option>
        </select>
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
        <button
          onClick={handleSchedule}
          className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Schedule
        </button>
      </div>

      {scheduled.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Scheduled Transactions</p>
          {scheduled.map((tx) => (
            <div
              key={tx.id}
              className="flex justify-between items-center p-2 bg-white rounded border"
            >
              <div>
                <p className="font-medium">
                  {tx.amount} {tx.currency}
                </p>
                <p className="text-xs text-gray-600">
                  {new Date(tx.scheduledFor).toLocaleString()}
                </p>
              </div>
              {tx.status === 'scheduled' && (
                <button
                  onClick={() => handleCancel(tx.id)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
