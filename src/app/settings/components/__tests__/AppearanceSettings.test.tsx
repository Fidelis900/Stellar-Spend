import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/provider";
import { AppearanceSettings } from "../AppearanceSettings";

const renderAppearance = (theme: "light" | "dark" | "system" = "system", onThemeChange = vi.fn()) =>
  render(
    <I18nProvider>
      <AppearanceSettings theme={theme} onThemeChange={onThemeChange} />
    </I18nProvider>,
  );

describe("AppearanceSettings", () => {
  it("renders three theme options", () => {
    renderAppearance();
    // light, dark, system
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("calls onThemeChange when a theme is selected", () => {
    const onThemeChange = vi.fn();
    renderAppearance("system", onThemeChange);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onThemeChange).toHaveBeenCalledWith("light");
  });
});
