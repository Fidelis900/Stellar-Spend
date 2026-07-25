"use client";

import { cn } from "@/lib/cn";
import type { UseSyncSettingsReturn } from "@/hooks/useSyncSettings";
import { SectionHeader } from "./SectionHeader";

interface PrivacySyncSettingsProps {
  sync: UseSyncSettingsReturn;
}

/** Privacy & Sync section — cross-device transaction history sync controls. */
export function PrivacySyncSettings({ sync }: PrivacySyncSettingsProps) {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="Privacy & Sync"
        description="Control how your transaction history is stored and synchronized"
      />

      <div className="space-y-6">
        <div className="bg-[#0f0f0f] border border-[#222] p-6 rounded">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white mb-2">Transaction History Sync</h3>
              <p className="text-xs text-[#777] mb-4">
                Enable synchronization of your transaction history across devices. When enabled,
                your history will be securely stored on our servers and available after logging in
                from a different device.
              </p>
              <p className="text-xs text-[#555]">
                Status: {sync.syncStatus.isPending ? "Syncing..." : "Ready"}
                {sync.syncStatus.lastSyncAt > 0 && (
                  <span> • Last synced: {sync.syncStatus.formattedLastSync}</span>
                )}
              </p>
            </div>
            <button
              onClick={() => sync.toggleSync(!sync.settings.syncEnabled)}
              disabled={sync.loading}
              className={cn(
                "px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all rounded",
                sync.settings.syncEnabled
                  ? "bg-red-900/30 border border-red-700 text-red-400 hover:bg-red-900/50"
                  : "bg-[#c9a962]/20 border border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962]/30",
              )}
            >
              {sync.loading ? "Updating..." : sync.settings.syncEnabled ? "Disable" : "Enable"}
            </button>
          </div>

          {sync.error && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded text-xs text-red-300">
              {sync.error}
            </div>
          )}

          {sync.settings.syncEnabled && (
            <div className="mt-4 p-3 bg-green-900/20 border border-green-700 rounded text-xs text-green-300">
              ✓ Sync enabled. Your transaction history will be automatically synchronized with our
              secure servers.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white">Sync Details</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-[#111] border border-[#222] rounded">
              <p className="text-[#777] uppercase tracking-widest mb-2">Strategy</p>
              <p className="text-white font-bold">Last-Write-Wins</p>
            </div>
            <div className="p-4 bg-[#111] border border-[#222] rounded">
              <p className="text-[#777] uppercase tracking-widest mb-2">Pending</p>
              <p className="text-white font-bold">{sync.syncStatus.isPending ? "Yes" : "No"}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#0f0f0f] border border-[#333] p-4 rounded">
          <p className="text-[10px] text-[#666] leading-relaxed">
            <strong>Privacy Notice:</strong> When sync is enabled, your transaction metadata
            (amounts, addresses, notes, tags) will be stored on encrypted servers. Your sync
            preference is always optional and can be disabled at any time. We never share your data
            with third parties without explicit consent. See our privacy policy for details.
          </p>
        </div>
      </div>
    </div>
  );
}
