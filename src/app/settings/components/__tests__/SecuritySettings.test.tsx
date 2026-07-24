import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/provider";

vi.mock("@/components/KYCLimitManager", () => ({
  KYCLimitManager: ({ userId }: { userId: string }) => (
    <div data-testid="kyc-manager">KYC for {userId}</div>
  ),
}));

import { SecuritySettings } from "../SecuritySettings";

describe("SecuritySettings", () => {
  it("renders the KYC limit manager with the given userId", () => {
    render(
      <I18nProvider>
        <SecuritySettings userId="user-42" />
      </I18nProvider>,
    );
    expect(screen.getByTestId("kyc-manager")).toHaveTextContent("KYC for user-42");
  });
});
