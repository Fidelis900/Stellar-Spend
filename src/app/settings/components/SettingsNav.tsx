"use client";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { SettingsSection } from "./types";

interface SettingsNavProps {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  onReset: () => void;
}

/** Sidebar navigation + reset control for the settings screen. */
export function SettingsNav({ activeSection, onSelect, onReset }: SettingsNavProps) {
  const { t } = useI18n();

  const navItems: { id: SettingsSection; label: string; icon: string }[] = [
    { id: "profile", label: t("settings.profile"), icon: "👤" },
    { id: "security", label: t("settings.security"), icon: "🔒" },
    { id: "appearance", label: t("settings.appearance"), icon: "🎨" },
    { id: "preferences", label: t("settings.preferences"), icon: "⚙️" },
    { id: "privacy", label: "Privacy & Sync", icon: "🔐" },
  ];

  return (
    <aside className="w-full md:w-64 space-y-2">
      <h1 className="text-2xl font-black uppercase tracking-tighter mb-8 italic text-white">
        {t("settings.title")}
      </h1>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all border",
              activeSection === item.id
                ? "bg-[#c9a962] text-[#0a0a0a] border-[#c9a962]"
                : "text-[#777] border-transparent hover:border-[#333] hover:text-white",
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="pt-8">
        <button
          onClick={onReset}
          className="w-full px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-red-500 border border-red-900/30 hover:bg-red-900/10 transition-all"
        >
          {t("settings.reset")}
        </button>
      </div>
    </aside>
  );
}
