"use client";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { SectionHeader } from "./SectionHeader";

type ThemeMode = "light" | "dark" | "system";

interface AppearanceSettingsProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

/** Appearance section — theme selection. */
export function AppearanceSettings({ theme, onThemeChange }: AppearanceSettingsProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t("settings.appearance")}
        description="Customize how the application looks"
      />

      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-[#777] uppercase tracking-widest">
            {t("settings.theme")}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(["light", "dark", "system"] as const).map((tMode) => (
              <button
                key={tMode}
                onClick={() => onThemeChange(tMode)}
                className={cn(
                  "px-4 py-4 border text-[10px] font-bold uppercase tracking-widest transition-all",
                  theme === tMode
                    ? "border-[#c9a962] bg-[#c9a962]/5 text-[#c9a962]"
                    : "border-[#222] text-[#555] hover:border-[#444] hover:text-white",
                )}
              >
                {t(`settings.${tMode}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
