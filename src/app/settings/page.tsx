"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useSyncSettings } from "@/hooks/useSyncSettings";
import {
  SettingsNav,
  ProfileSettings,
  SecuritySettings,
  AppearanceSettings,
  PreferencesSettings,
  PrivacySyncSettings,
  SETTINGS_SECTIONS,
  type SettingsSection,
  type NotificationPrefs,
} from "./components";

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [isSaved, setIsSaved] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPrefs>({
    email: true,
    push: false,
    marketing: false,
  });
  const [, setCurrency] = useState("USDC");
  const [userAddress, setUserAddress] = useState<string | null>(null);

  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const syncSettings = useSyncSettings(userAddress || undefined);

  // Handle deep linking
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as SettingsSection;
    if (SETTINGS_SECTIONS.includes(hash)) {
      setActiveSection(hash);
    }
  }, []);

  // TODO: Get user address from wallet context
  useEffect(() => {
    // Placeholder - should get from wallet context
    const stored = localStorage.getItem("userAddress");
    if (stored) {
      setUserAddress(stored);
    }
  }, []);

  const handleSelectSection = (section: SettingsSection) => {
    setActiveSection(section);
    window.location.hash = section;
  };

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
    // In a real app, this would call a server-side API
  };

  const handleReset = () => {
    setTheme("system");
    setLanguage("en");
    setNotifications({ email: true, push: false, marketing: false });
    setCurrency("USDC");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        <SettingsNav
          activeSection={activeSection}
          onSelect={handleSelectSection}
          onReset={handleReset}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-h-[600px] border border-[#222] bg-[#0a0a0a] p-8 shadow-2xl relative">
          {isSaved && (
            <div className="absolute top-4 right-8 bg-green-500 text-[#0a0a0a] px-4 py-2 text-[10px] font-black uppercase tracking-widest animate-in slide-in-from-top-4 duration-300">
              {t("settings.saved")}
            </div>
          )}

          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            {activeSection === "profile" && <ProfileSettings />}
            {activeSection === "security" && <SecuritySettings userId="current-user" />}
            {activeSection === "appearance" && (
              <AppearanceSettings theme={theme} onThemeChange={setTheme} />
            )}
            {activeSection === "preferences" && (
              <PreferencesSettings
                language={language}
                onLanguageChange={setLanguage}
                notifications={notifications}
                onNotificationsChange={setNotifications}
              />
            )}
            {activeSection === "privacy" && <PrivacySyncSettings sync={syncSettings} />}
          </div>

          <div className="mt-12 pt-8 border-t border-[#222] flex justify-end">
            <button
              onClick={handleSave}
              className="px-12 py-4 bg-[#c9a962] text-[#0a0a0a] text-xs font-black uppercase tracking-[0.2em] hover:bg-[#d4b97a] transition-all shadow-[0_4px_20px_rgba(201,169,98,0.2)]"
            >
              {t("settings.save")}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
