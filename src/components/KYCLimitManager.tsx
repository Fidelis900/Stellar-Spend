'use client';

import { useState, useEffect } from 'react';
import { KYCLimitService, KYCStatus, LimitTier } from '@/lib/kyc-limits';
import { Button, Card } from '@/components/design-system';

interface KYCLimitManagerProps {
  userId: string;
}

export function KYCLimitManager({ userId }: KYCLimitManagerProps) {
  const [kycStatus, setKycStatus] = useState<KYCStatus>('unverified');
  const [limits, setLimits] = useState<any>(null);
  const [showKYCForm, setShowKYCForm] = useState(false);
  const [showLimitRequest, setShowLimitRequest] = useState(false);
  const [formData, setFormData] = useState({
    documentType: 'passport',
    documentId: '',
  });
  const [requestedTier, setRequestedTier] = useState<LimitTier>('tier2');

  useEffect(() => {
    const kyc = KYCLimitService.getKYC(userId);
    if (kyc) setKycStatus(kyc.status);

    const userLimits = KYCLimitService.getUserLimits(userId);
    if (!userLimits) {
      KYCLimitService.initializeUserLimits(userId);
    }
    setLimits(KYCLimitService.getUserLimits(userId));
  }, [userId]);

  const handleSubmitKYC = () => {
    if (!formData.documentId) return;
    KYCLimitService.submitKYC(userId, formData.documentType, formData.documentId);
    setKycStatus('pending');
    setShowKYCForm(false);
    setFormData({ documentType: 'passport', documentId: '' });
  };

  const handleRequestLimitIncrease = () => {
    KYCLimitService.requestLimitIncrease(userId, requestedTier);
    setShowLimitRequest(false);
    setLimits(KYCLimitService.getUserLimits(userId));
  };

  const tierLimits: Record<LimitTier, { daily: number; monthly: number }> = {
    tier1: { daily: 1000, monthly: 10000 },
    tier2: { daily: 5000, monthly: 50000 },
    tier3: { daily: 50000, monthly: 500000 },
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">KYC Verification</h3>
        <div className="mb-4">
          <p className="text-sm text-gray-600">Status: <span className="font-medium capitalize">{kycStatus}</span></p>
        </div>

        {kycStatus === 'unverified' && !showKYCForm && (
          <Button onClick={() => setShowKYCForm(true)}>Start KYC</Button>
        )}

        {showKYCForm && (
          <div className="space-y-2">
            <select
              value={formData.documentType}
              onChange={e => setFormData({ ...formData, documentType: e.target.value })}
              className="w-full p-2 border rounded"
            >
              <option value="passport">Passport</option>
              <option value="license">Driver License</option>
              <option value="id">National ID</option>
            </select>
            <input
              type="text"
              placeholder="Document ID"
              value={formData.documentId}
              onChange={e => setFormData({ ...formData, documentId: e.target.value })}
              className="w-full p-2 border rounded"
            />
            <div className="flex gap-2">
              <Button onClick={handleSubmitKYC}>Submit</Button>
              <Button onClick={() => setShowKYCForm(false)} variant="secondary">Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      {limits && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Transaction Limits</h3>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between">
              <span>Current Tier:</span>
              <span className="font-medium capitalize">{limits.tier}</span>
            </div>
            <div className="flex justify-between">
              <span>Daily Limit:</span>
              <span className="font-medium">${tierLimits[limits.tier].daily}</span>
            </div>
            <div className="flex justify-between">
              <span>Monthly Limit:</span>
              <span className="font-medium">${tierLimits[limits.tier].monthly}</span>
            </div>
            <div className="flex justify-between">
              <span>Daily Used:</span>
              <span className="font-medium">${limits.dailyUsed}</span>
            </div>
            <div className="flex justify-between">
              <span>Monthly Used:</span>
              <span className="font-medium">${limits.monthlyUsed}</span>
            </div>
          </div>

          {!showLimitRequest && limits.tier !== 'tier3' && (
            <Button onClick={() => setShowLimitRequest(true)}>Request Limit Increase</Button>
          )}

          {showLimitRequest && (
            <div className="space-y-2">
              <select
                value={requestedTier}
                onChange={e => setRequestedTier(e.target.value as LimitTier)}
                className="w-full p-2 border rounded"
              >
                {limits.tier === 'tier1' && <option value="tier2">Tier 2</option>}
                {limits.tier === 'tier1' && <option value="tier3">Tier 3</option>}
                {limits.tier === 'tier2' && <option value="tier3">Tier 3</option>}
              </select>
              <div className="flex gap-2">
                <Button onClick={handleRequestLimitIncrease}>Request</Button>
                <Button onClick={() => setShowLimitRequest(false)} variant="secondary">Cancel</Button>
              </div>
            </div>
          )}

          {limits.limitIncreaseRequests.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Pending Requests:</p>
              {limits.limitIncreaseRequests.map((req: any) => (
                <div key={req.id} className="text-sm p-2 bg-gray-100 rounded">
                  {req.requestedTier} - <span className="capitalize">{req.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
