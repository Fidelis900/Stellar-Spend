import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/provider";
import { ProfileSettings } from "../ProfileSettings";

const renderProfile = (props = {}) =>
  render(
    <I18nProvider>
      <ProfileSettings {...props} />
    </I18nProvider>,
  );

describe("ProfileSettings", () => {
  it("renders the provided public address", () => {
    renderProfile({ address: "GABC...9999" });
    expect(screen.getByText("GABC...9999")).toBeInTheDocument();
  });

  it("shows a validation error for an invalid display name", () => {
    renderProfile();
    const input = screen.getByLabelText("Display Name");
    fireEvent.change(input, { target: { value: "a" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 2/);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("clears the error once the name becomes valid", () => {
    renderProfile();
    const input = screen.getByLabelText("Display Name");
    fireEvent.change(input, { target: { value: "a" } });
    expect(screen.queryByRole("alert")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Ada" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
