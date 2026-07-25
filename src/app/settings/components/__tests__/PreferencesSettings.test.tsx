import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/provider";
import { PreferencesSettings } from "../PreferencesSettings";
import type { NotificationPrefs } from "../types";

const notifications: NotificationPrefs = { email: true, push: false, marketing: false };

describe("PreferencesSettings", () => {
  it("calls onLanguageChange when a new language is selected", () => {
    const onLanguageChange = vi.fn();
    render(
      <I18nProvider>
        <PreferencesSettings
          language="en"
          onLanguageChange={onLanguageChange}
          notifications={notifications}
          onNotificationsChange={vi.fn()}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "es" } });
    expect(onLanguageChange).toHaveBeenCalledWith("es");
  });

  it("embeds the notification preferences", () => {
    render(
      <I18nProvider>
        <PreferencesSettings
          language="en"
          onLanguageChange={vi.fn()}
          notifications={notifications}
          onNotificationsChange={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThanOrEqual(2);
  });
});
