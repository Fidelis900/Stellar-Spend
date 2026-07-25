import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/history",
  useSearchParams: () => searchParams,
}));

import { useHistoryFilters } from "../useHistoryFilters";
import { FILTERS_STORAGE_KEY } from "@/app/history/filters";

describe("useHistoryFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    searchParams = new URLSearchParams();
  });

  it("hydrates from URL params over localStorage defaults", () => {
    searchParams = new URLSearchParams({ status: "failed" });
    const { result } = renderHook(() => useHistoryFilters());
    expect(result.current.filters.status).toBe("failed");
    expect(result.current.filtersLoaded).toBe(true);
  });

  it("set() updates a single field and persists to localStorage + URL", () => {
    const { result } = renderHook(() => useHistoryFilters());
    act(() => result.current.set("search", "abc"));

    expect(result.current.filters.search).toBe("abc");
    expect(result.current.filterCount).toBe(1);
    expect(localStorage.getItem(FILTERS_STORAGE_KEY)).toContain("abc");
    expect(replace).toHaveBeenCalledWith("/history?search=abc", { scroll: false });
  });

  it("clear() resets to defaults", () => {
    const { result } = renderHook(() => useHistoryFilters());
    act(() => result.current.set("search", "abc"));
    act(() => result.current.clear());
    expect(result.current.filters.search).toBe("");
    expect(result.current.filterCount).toBe(0);
  });

  it("toggleSort flips direction and switches field", () => {
    const { result } = renderHook(() => useHistoryFilters());
    // Same field (default timestamp/desc) -> asc
    act(() => result.current.toggleSort("timestamp"));
    expect(result.current.filters.sortDir).toBe("asc");
    // Switch field -> back to desc
    act(() => result.current.toggleSort("amount"));
    expect(result.current.filters.sortField).toBe("amount");
    expect(result.current.filters.sortDir).toBe("desc");
  });

  it("applyPreset maps a preset onto filter state", () => {
    const { result } = renderHook(() => useHistoryFilters());
    act(() => result.current.applyPreset("pending"));
    expect(result.current.filters.status).toBe("pending");
  });

  it("saveCurrentView persists and lists a saved view; delete removes it", () => {
    const { result } = renderHook(() => useHistoryFilters());
    act(() => result.current.set("currency", "NGN"));
    act(() => result.current.saveCurrentView("My view"));

    expect(result.current.savedViews).toHaveLength(1);
    const id = result.current.savedViews[0].id;
    expect(result.current.savedViews[0].name).toBe("My view");

    act(() => result.current.deleteSavedView(id));
    expect(result.current.savedViews).toHaveLength(0);
  });

  it("saveCurrentView ignores blank names", () => {
    const { result } = renderHook(() => useHistoryFilters());
    act(() => result.current.saveCurrentView("   "));
    expect(result.current.savedViews).toHaveLength(0);
  });
});
