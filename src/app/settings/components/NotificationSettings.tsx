"use client";

import { useI18n } from "@/lib/i18n";
import type { NotificationPrefs } from "./types";

interface NotificationSettingsProps {
  notifications: NotificationPrefs;
  onChange: (notifications: NotificationPrefs) => void;
}

/** Notification preferences — email / push toggles. */
export function NotificationSettings({ notifications, onChange }: NotificationSettingsProps) {
  const { t } = useI18n();

  const toggle = (key: keyof NotificationPrefs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...notifications, [key]: e.target.checked });

  return (
    <div className="space-y-4">
      <label className="text-[10px] font-bold text-[#777] uppercase tracking-widest">
        {t("settings.notifications")}
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-[#111] border border-[#222]">
          <span className="text-xs text-[#aaa] font-medium">
            {t("settings.email_notifications")}
          </span>
          <input
            type="checkbox"
            aria-label={t("settings.email_notifications")}
            checked={notifications.email}
            onChange={toggle("email")}
            className="w-4 h-4 accent-[#c9a962]"
          />
        </div>
        <div className="flex items-center justify-between p-4 bg-[#111] border border-[#222]">
          <span className="text-xs text-[#aaa] font-medium">
            {t("settings.push_notifications")}
          </span>
          <input
            type="checkbox"
            aria-label={t("settings.push_notifications")}
            checked={notifications.push}
            onChange={toggle("push")}
            className="w-4 h-4 accent-[#c9a962]"
          />
        </div>
      </div>
    </div>
  );
}
