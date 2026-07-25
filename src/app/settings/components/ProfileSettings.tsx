"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { validateDisplayName, DISPLAY_NAME_MAX } from "@/lib/validation";
import { SectionHeader } from "./SectionHeader";

interface ProfileSettingsProps {
  /** Public wallet address to display (read-only). */
  address?: string;
}

/** Profile section — public presence and account details. */
export function ProfileSettings({ address = "GDUY...7J2L" }: ProfileSettingsProps) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const handleNameChange = (value: string) => {
    setDisplayName(value);
    setError(validateDisplayName(value).error);
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t("settings.profile")}
        description="Manage your public presence and account details"
      />

      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-[#777] uppercase tracking-widest">
            Public Address
          </label>
          <div className="p-4 bg-[#111] border border-[#222] font-mono text-xs text-[#aaa] break-all">
            {address}
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="settings-display-name"
            className="text-[10px] font-bold text-[#777] uppercase tracking-widest"
          >
            Display Name
          </label>
          <input
            id="settings-display-name"
            type="text"
            value={displayName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter name..."
            maxLength={DISPLAY_NAME_MAX + 1}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "settings-display-name-error" : undefined}
            className="w-full bg-[#111] border border-[#333] px-4 py-3 text-xs text-white focus:outline-none focus:border-[#c9a962]"
          />
          {error && (
            <p id="settings-display-name-error" role="alert" className="text-[10px] text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
