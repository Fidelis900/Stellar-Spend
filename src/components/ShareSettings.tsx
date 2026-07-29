'use client';

import { useState } from 'react';
import { ShareSettings } from '@/types/sharing';

interface ShareSettingsProps {
  onSave: (settings: ShareSettings) => Promise<void>;
  initialSettings?: ShareSettings;
}

export function ShareSettingsComponent({ onSave, initialSettings }: ShareSettingsProps) {
  const [allowSharing, setAllowSharing] = useState(initialSettings?.allowSharing ?? true);
  const [expirationDays, setExpirationDays] = useState(initialSettings?.expirationDays ?? 30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const shareableFields = ['amount', 'currency', 'status', 'timestamp'];

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await onSave({
        allowSharing,
        shareableFields,
        expirationDays: allowSharing ? expirationDays : undefined,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Allow Transaction Sharing</label>
        <input
          type="checkbox"
          checked={allowSharing}
          onChange={(e) => setAllowSharing(e.target.checked)}
          className="w-4 h-4"
        />
      </div>

      {allowSharing && (
        <div>
          <label className="block text-sm font-medium mb-2">Share Link Expiration (days)</label>
          <input
            type="number"
            min="1"
            max="365"
            value={expirationDays}
            onChange={(e) => setExpirationDays(parseInt(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">
            Share links will expire after {expirationDays} days
          </p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-2">Shareable Information</p>
        <div className="space-y-2">
          {shareableFields.map((field) => (
            <label key={field} className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="w-4 h-4" />
              <span className="text-sm capitalize">{field}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {success && <div className="text-green-600 text-sm">Settings saved successfully</div>}

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
