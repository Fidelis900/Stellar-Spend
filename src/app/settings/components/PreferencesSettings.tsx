"use client";

import { useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n";
import { NotificationSettings } from "./NotificationSettings";
import { SectionHeader } from "./SectionHeader";
import type { NotificationPrefs } from "./types";

interface PreferencesSettingsProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  notifications: NotificationPrefs;
  onNotificationsChange: (notifications: NotificationPrefs) => void;
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "zh", label: "中文" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
  { value: "sw", label: "Kiswahili" },
];

/** Preferences section — localization and notification behaviour. */
export function PreferencesSettings({
  language,
  onLanguageChange,
  notifications,
  onNotificationsChange,
}: PreferencesSettingsProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t("settings.preferences")}
        description="System-wide behavior and localization"
      />

      <div className="space-y-8">
        <div className="space-y-3">
          <label
            htmlFor="settings-language"
            className="text-[10px] font-bold text-[#777] uppercase tracking-widest"
          >
            {t("settings.language")}
          </label>
          <select
            id="settings-language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            className="w-full bg-[#111] border border-[#333] px-4 py-3 text-xs text-white focus:outline-none focus:border-[#c9a962] appearance-none"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <NotificationSettings notifications={notifications} onChange={onNotificationsChange} />
      </div>
    </div>
  );
}
