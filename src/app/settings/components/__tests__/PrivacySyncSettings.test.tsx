import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrivacySyncSettings } from "../PrivacySyncSettings";
import type { UseSyncSettingsReturn } from "@/hooks/useSyncSettings";

function makeSync(overrides: Partial<UseSyncSettingsReturn> = {}): UseSyncSettingsReturn {
  return {
    settings: { syncEnabled: false } as UseSyncSettingsReturn["settings"],
    loading: false,
    error: null,
    toggleSync: vi.fn().mockResolvedValue(true),
    syncStatus: { lastSyncAt: 0, isPending: false, formattedLastSync: "" },
    ...overrides,
  };
}

describe("PrivacySyncSettings", () => {
  it("shows Enable when sync is disabled", () => {
    render(<PrivacySyncSettings sync={makeSync()} />);
    expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
  });

  it("shows Disable and the confirmation banner when sync is enabled", () => {
    const sync = makeSync({
      settings: { syncEnabled: true } as UseSyncSettingsReturn["settings"],
    });
    render(<PrivacySyncSettings sync={sync} />);
    expect(screen.getByRole("button", { name: /disable/i })).toBeInTheDocument();
    expect(screen.getByText(/Sync enabled/i)).toBeInTheDocument();
  });

  it("toggles sync on when the button is clicked", () => {
    const sync = makeSync();
    render(<PrivacySyncSettings sync={sync} />);
    fireEvent.click(screen.getByRole("button", { name: /enable/i }));
    expect(sync.toggleSync).toHaveBeenCalledWith(true);
  });

  it("renders an error message when present", () => {
    render(<PrivacySyncSettings sync={makeSync({ error: "boom" })} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
