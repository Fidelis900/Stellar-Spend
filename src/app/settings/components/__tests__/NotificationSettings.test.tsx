import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/provider";
import { NotificationSettings } from "../NotificationSettings";
import type { NotificationPrefs } from "../types";

const base: NotificationPrefs = { email: true, push: false, marketing: false };

const renderNotifications = (onChange = vi.fn(), notifications = base) =>
  render(
    <I18nProvider>
      <NotificationSettings notifications={notifications} onChange={onChange} />
    </I18nProvider>,
  );

describe("NotificationSettings", () => {
  it("reflects the current preferences", () => {
    renderNotifications();
    const [email, push] = screen.getAllByRole("checkbox");
    expect(email).toBeChecked();
    expect(push).not.toBeChecked();
  });

  it("calls onChange when toggling push, preserving other prefs", () => {
    const onChange = vi.fn();
    renderNotifications(onChange);
    const [, push] = screen.getAllByRole("checkbox");
    fireEvent.click(push);
    expect(onChange).toHaveBeenCalledWith({ email: true, push: true, marketing: false });
  });
});
